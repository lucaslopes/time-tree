import { Plugin, TFile, Notice } from "obsidian";
import { defaultSettings, TimeTreeSettings } from "./settings";
import { TimeTreeSettingsTab } from "./settings-tab";
import { FrontMatterManager } from "./front-matter-manager";
import { TimeTreeCalculator } from "./time-tree-calculator";

export default class TimeTreePlugin extends Plugin {
	public api = (this.app as any).plugins.plugins["simple-time-tracker"].api;
	public settings: TimeTreeSettings;
	private frontMatterManager: FrontMatterManager;
	private calculator: TimeTreeCalculator;

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
			new Notice("Root note path is not configured in settings.");
			return;
		}
		const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
		if (!rootFile || !(rootFile instanceof TFile)) {
			new Notice("Root note file not found.");
			return;
		}
		const localElapsed =
			await this.calculator.calculateRecursiveElapsedTime(rootFile);
		new Notice(`Updated recursive elapsed time: ${localElapsed}`);
		const totalElapsedChild =
			await this.calculator.calculateRecursiveElapsedChild(rootFile);
		const ownElapsed =
			(await this.frontMatterManager.getProperty(rootFile, "elapsed")) ||
			0;
		new Notice(
			`Updated elapsed_child for root note: ${
				totalElapsedChild - ownElapsed
			}`
		);
		await this.calculator.updateNodeSizeFromFile(rootFile);
	}
}
