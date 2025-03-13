import { Plugin, TFile, Notice, Editor, MarkdownView } from "obsidian";
import { defaultSettings, TimeTreeSettings } from "./settings";
import { TimeTreeSettingsTab } from "./settings-tab";
import { FrontMatterManager } from "./front-matter-manager";
import { TimeTreeCalculator } from "./time-tree-calculator";

export default class TimeTreePlugin extends Plugin {
	public api = (this.app as any).plugins.plugins["simple-time-tracker"].api;
	public settings: TimeTreeSettings;
	private frontMatterManager: FrontMatterManager;
	private calculator: TimeTreeCalculator;
	private computeIntervalHandle: any;
	private buttonObserver: MutationObserver | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.frontMatterManager = new FrontMatterManager(this.app);
		this.calculator = new TimeTreeCalculator(
			this.app,
			this.settings,
			this.api,
			this.frontMatterManager
		);

		this.addSettingTab(new TimeTreeSettingsTab(this.app, this));

		this.addCommand({
			id: "start-stop",
			name: "Start/Stop Tracker",
			callback: async () => {
				await this.startStopTracker();
			},
		});

		this.addCommand({
			id: "elapsed-time",
			name: "Update elapsed time of the current note",
			callback: async () => {
				await this.elapsedTime();
			},
		});

		this.addCommand({
			id: "compute-time-tree",
			name: "Compute hierarchical elapsed time from root note",
			callback: async () => {
				await this.computeTimeTree();
			},
		});

		this.addCommand({
			id: "sub-task",
			name: "Insert subtask",
			editorCallback: (editor, _) => {
				this.insertNewTask(editor);
			},
		});

		this.buttonObserver = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node instanceof HTMLElement) {
						const btn = node.querySelector(
							".simple-time-tracker-btn"
						) as HTMLButtonElement | null;
						if (btn) {
							btn.addEventListener("click", () => {
								const btnStatus =
									btn.getAttribute("aria-label");
								if (btnStatus === "End") {
									this.elapsedTime();
								}
							});
						}
					}
				});
			});
		});
		this.buttonObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});

		this.scheduleComputeTimeTree();
	}

	onunload(): void {
		if (this.buttonObserver) {
			this.buttonObserver.disconnect();
		}
		if (this.computeIntervalHandle) {
			clearInterval(this.computeIntervalHandle);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			defaultSettings,
			await this.loadData()
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.scheduleComputeTimeTree();
	}

	async adjustCursorOutsideTracker(editor: Editor): Promise<void> {
		// Get the full content and split it into lines.
		const content = editor.getValue();
		const lines = content.split("\n");

		// Determine the end of YAML front matter if present. Line L is the last line of YAML metadata.
		let yamlEnd = 0;
		if (lines[0].trim() === "---") {
			for (let i = 1; i < lines.length; i++) {
				if (lines[i].trim() === "---") {
					yamlEnd = i + 1; // YAML metadata ends at line L
					break;
				}
			}
		}

		// Collect tracker block boundaries, but only after the YAML metadata.
		const trackerBlocks: { start: number; end: number }[] = [];
		for (let i = yamlEnd; i < lines.length; i++) {
			if (lines[i].trimEnd() === "```simple-time-tracker") {
				const blockStart = i;
				// Look for the closing marker.
				for (let j = i + 1; j < lines.length; j++) {
					if (lines[j].trimEnd() === "```") {
						trackerBlocks.push({ start: blockStart, end: j });
						i = j; // Skip the rest of this block
						break;
					}
				}
			}
		}

		// Define a helper to check if a given line index is inside any tracker block.
		const isLineInTracker = (line: number): boolean => {
			return trackerBlocks.some(
				(block) => line >= block.start && line <= block.end
			);
		};

		// Find the first line after YAML metadata that is not inside any tracker block.
		let targetLine = yamlEnd;
		while (targetLine < lines.length && isLineInTracker(targetLine)) {
			targetLine++;
		}
		if (targetLine >= lines.length) {
			targetLine = lines.length - 1;
		}

		// Get the current cursor position.
		const cursor = editor.getCursor();

		// If the cursor is not inside any tracker block, do nothing.
		const cursorInTracker = trackerBlocks.some(
			(block) => cursor.line >= block.start && cursor.line <= block.end
		);
		if (!cursorInTracker) {
			return;
		}

		// Move the cursor to the first line after YAML metadata that is not part of any tracker block.
		editor.setCursor({ line: targetLine, ch: 0 });
	}

	async startStopTracker(): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			await this.adjustCursorOutsideTracker(activeView.editor);
		} else {
			new Notice("No active Markdown editor found.");
		}
		const btn = document.querySelector(
			".simple-time-tracker-btn"
		) as HTMLButtonElement | null;
		if (btn) {
			btn.click();
		} else {
			new Notice("No Start/Stop button found.");
		}
	}

	async elapsedTime(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active file found.");
			return;
		}
		let elapsed = 0;
		elapsed = await this.calculator.calculateElapsedTime(activeFile);
		await new Promise((resolve) => setTimeout(resolve, 10));
		await this.frontMatterManager.updateProperty(
			activeFile,
			(frontmatter) => {
				frontmatter.elapsed = elapsed;
				return frontmatter;
			}
		);
		await this.calculator.communicateAscendants(activeFile);
		const rootPath = this.settings.rootNotePath;
		if (rootPath) {
			const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
			if (rootFile && rootFile instanceof TFile) {
				await this.calculator.updateNodeSizeFromFile(rootFile);
			}
		}
		new Notice(`Updated elapsed time: ${elapsed}`);
	}

	async computeTimeTree(): Promise<void> {
		const rootPath = this.settings.rootNotePath;
		if (!rootPath) {
			new Notice(
				"Root note path is not configured in Time Tree settings."
			);
			return;
		}
		const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
		if (!rootFile || !(rootFile instanceof TFile)) {
			new Notice(`Root note ${rootPath} not found.`);
			return;
		}

		// Show a persistent loading notification
		const loadingNotice = new Notice("Computing Time Tree...", 0);
		try {
			await this.calculator.calculateRecursiveElapsedTime(rootFile);
			await this.calculator.calculateRecursiveElapsedChild(rootFile);
			await this.calculator.updateNodeSizeFromFile(rootFile);
			new Notice(`Time Tree computed from note: ${rootPath}`, 1000);
		} finally {
			loadingNotice.hide();
		}
	}

	async insertNewTask(editor: Editor): Promise<void> {
		let cursor = editor.getCursor();
		if (cursor.ch !== 0) {
			const currentLineText = editor.getLine(cursor.line);
			editor.replaceRange("\n", {
				line: cursor.line,
				ch: currentLineText.length,
			});
			cursor = { line: cursor.line + 1, ch: 0 };
			editor.setCursor(cursor);
		}
		const textToInsert = "# [[]]";
		editor.replaceRange(textToInsert, cursor);
		editor.setCursor({ line: cursor.line, ch: cursor.ch + 4 });
	}

	scheduleComputeTimeTree(): void {
		// Clear any existing interval
		if (this.computeIntervalHandle) {
			clearInterval(this.computeIntervalHandle);
		}
		// Only schedule if the compute interval is greater than 0 (enabled)
		if (this.settings.computeIntervalMinutes > 0) {
			const intervalMs = this.settings.computeIntervalMinutes * 60 * 1000;
			this.computeIntervalHandle = setInterval(async () => {
				await this.computeTimeTree();
			}, intervalMs);
		}
	}
}
