import { Plugin, TFile, Notice, Editor } from "obsidian";
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
			id: "new-task",
			name: "Insert new task",
			editorCallback: (editor, view) => {
				this.insertNewTask(editor);
			},
		});

		this.scheduleComputeTimeTree();
	}

	onunload(): void {
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

	async elapsedTime(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active file found.");
			return;
		}
		const elapsed = await this.calculator.calculateElapsedTime(activeFile);
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
