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

		this.addCommand({
			id: "change-status-todo",
			name: 'Change status to "todo"',
			callback: async () => {
				await this.updateNoteProperty("status", "todo");
			},
		});

		this.addCommand({
			id: "change-status-doing",
			name: 'Change status to "doing"',
			callback: async () => {
				await this.updateNoteProperty("status", "doing");
			},
		});

		this.addCommand({
			id: "change-status-done",
			name: 'Change status to "done"',
			callback: async () => {
				await this.updateNoteProperty("status", "done");
			},
		});

		this.addCommand({
			id: "change-priority-lowest",
			name: 'Change priority to "Lowest"',
			callback: async () => {
				await this.updateNoteProperty("priority", "Lowest");
			},
		});

		this.addCommand({
			id: "change-priority-low",
			name: 'Change priority to "Low"',
			callback: async () => {
				await this.updateNoteProperty("priority", "Low");
			},
		});

		this.addCommand({
			id: "change-priority-medium",
			name: 'Change priority to "Medium"',
			callback: async () => {
				await this.updateNoteProperty("priority", "Medium");
			},
		});

		this.addCommand({
			id: "change-priority-high",
			name: 'Change priority to "High"',
			callback: async () => {
				await this.updateNoteProperty("priority", "High");
			},
		});

		this.addCommand({
			id: "change-priority-highest",
			name: 'Change priority to "Highest"',
			callback: async () => {
				await this.updateNoteProperty("priority", "Highest");
			},
		});

		this.addCommand({
			id: "open-running-note",
			name: "Open Running Note",
			callback: async () => {
				await this.openRunningNote();
			},
		});

		this.buttonObserver = new MutationObserver((mutations) => {
			const delay = (ms: number) =>
				new Promise((resolve) => setTimeout(resolve, ms));
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node instanceof HTMLElement) {
						const btn = node.querySelector(
							".simple-time-tracker-btn"
						) as HTMLButtonElement | null;
						if (btn) {
							btn.addEventListener("click", async () => {
								const btnStatus =
									btn.getAttribute("aria-label");
								if (btnStatus === "End") {
									this.elapsedTime();
									await delay(100);
									await this.updateNoteProperty(
										"running",
										"false",
										false
									);
								} else {
									await delay(100);
									await this.updateNoteProperty(
										"running",
										"true",
										false
									);
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

	async startStopTracker(): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			await this.frontMatterManager.adjustCursorOutsideTracker(
				activeView.editor
			);
		} else {
			new Notice("No active Markdown editor found.");
		}
		const btn = activeView
			? (activeView.containerEl.querySelector(
					".simple-time-tracker-btn"
			  ) as HTMLButtonElement | null)
			: null;
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
		const currentLineText = editor.getLine(cursor.line);
		if (currentLineText.trim() !== "" || cursor.ch !== 0) {
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

	async updateNoteProperty(
		property: string,
		value: string,
		verbose: boolean = true
	): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active file found.");
			return;
		}
		const valueBool = value === "true" || value === "false";
		const valueInput = valueBool
			? value === "true"
				? true
				: false
			: value;

		await this.frontMatterManager.updateProperty(
			activeFile,
			(frontmatter) => {
				frontmatter[property] = valueInput;
				return frontmatter;
			}
		);
		if (verbose) {
			new Notice(`Updated ${property} to ${value}`);
		}
	}

	async openRunningNote(): Promise<void> {
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

		const runningNote = await this.frontMatterManager.findRunningNote(
			rootFile
		);
		if (runningNote) {
			this.app.workspace.getLeaf().openFile(runningNote);
		} else {
			new Notice("No note with 'running: true' found.");
		}
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
