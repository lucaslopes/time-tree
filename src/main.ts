import { Plugin, TFile, App } from "obsidian";
import { defaultSettings, TimeTreeSettings } from "./settings";
import { TimeTreeSettingsTab } from "./settings-tab";
import { FrontMatterManager } from "./front-matter-manager";
import { TimeTreeHandler } from "./command-handler";
import { delay } from "./utils";

interface AppWithPlugins extends App {
    plugins: {
        plugins: Record<string, { api?: unknown }>;
    };
}

export default class TimeTreePlugin extends Plugin {
	public simpleTimeTrackerApi: unknown;
	public dataViewApi: unknown;
	public settings: TimeTreeSettings;
	private frontMatterManager: FrontMatterManager;
	private computeIntervalHandle: NodeJS.Timeout | null = null;
	private buttonObserver: MutationObserver | null = null;
	private commandHandler: TimeTreeHandler;
	private pluginLoadTime = 0;

	private async loadPlugins(verbose = false): Promise<void> {
		// Load Simple Time Tracker API
		const simpleTimeTrackerPlugin = (this.app as AppWithPlugins).plugins.plugins["simple-time-tracker"];
		if (simpleTimeTrackerPlugin && simpleTimeTrackerPlugin.api) {
			this.simpleTimeTrackerApi = simpleTimeTrackerPlugin.api;
			if (verbose) console.log("Simple Time Tracker plugin loaded successfully.");
		} else {
			if (verbose) console.error("Simple Time Tracker plugin is not available.");
		}

		// Load DataView API
		const dataViewPlugin = (this.app as AppWithPlugins).plugins.plugins["dataview"];
		if (dataViewPlugin && dataViewPlugin.api) {
			this.dataViewApi = dataViewPlugin.api;
			if (verbose) console.log("DataView plugin loaded successfully.");
		} else {
			if (verbose) console.error("DataView plugin is not available.");
		}
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		await this.loadPlugins();

		this.addSettingTab(new TimeTreeSettingsTab(this.app, this));
		this.frontMatterManager = new FrontMatterManager(this.app);

		this.commandHandler = new TimeTreeHandler(
			this.app,
			this.simpleTimeTrackerApi,
			this.settings,
			this.frontMatterManager
		);

		this.addCommand({
			id: "start-stop",
			name: "Start/Stop Tracker",
			callback: async () => {
				await this.commandHandler.startStopTracker();
			},
		});

		this.addCommand({
			id: "elapsed-time",
			name: "Update elapsed time of the current note",
			callback: async () => {
				await this.commandHandler.elapsedTime();
			},
		});

		this.addCommand({
			id: "compute-time-tree",
			name: "Compute hierarchical elapsed time from root note",
			callback: async () => {
				await this.commandHandler.computeTimeTree();
			},
		});

		this.addCommand({
			id: "sub-task",
			name: "Insert subtask",
			editorCallback: (editor, _) => {
				this.commandHandler.insertSubTask(editor);
			},
		});

		this.addCommand({
			id: "toggle-status",
			name: 'Toggle status between "todo" and "done"',
			callback: async () => {
				await this.commandHandler.toggleStatus();
			},
		});

		this.addCommand({
			id: "change-priority-lowest",
			name: 'Change priority to "Lowest"',
			callback: async () => {
				await this.commandHandler.updateNoteProperty("priority", "Lowest");
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					await this.commandHandler.propagatePriorityToDescendants(activeFile, "Lowest");
				}
			},
		});

		this.addCommand({
			id: "change-priority-low",
			name: 'Change priority to "Low"',
			callback: async () => {
				await this.commandHandler.updateNoteProperty("priority", "Low");
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					await this.commandHandler.propagatePriorityToDescendants(activeFile, "Low");
				}
			},
		});

		this.addCommand({
			id: "change-priority-medium",
			name: 'Change priority to "Medium"',
			callback: async () => {
				await this.commandHandler.updateNoteProperty("priority", "Medium");
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					await this.commandHandler.propagatePriorityToDescendants(activeFile, "Medium");
				}
			},
		});

		this.addCommand({
			id: "change-priority-high",
			name: 'Change priority to "High"',
			callback: async () => {
				await this.commandHandler.updateNoteProperty("priority", "High");
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					await this.commandHandler.propagatePriorityToDescendants(activeFile, "High");
				}
			},
		});

		this.addCommand({
			id: "change-priority-highest",
			name: 'Change priority to "Highest"',
			callback: async () => {
				await this.commandHandler.updateNoteProperty("priority", "Highest");
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					await this.commandHandler.propagatePriorityToDescendants(activeFile, "Highest");
				}
			},
		});

		this.addCommand({
			id: "open-running-note",
			name: "Open Running Note",
			callback: async () => {
				await this.commandHandler.openDoingNote();
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
							btn.addEventListener("click", async () => {
								await this.commandHandler.handleTrackerButtonClick(btn);
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

		// const rootFile = await getRootFile(this.app, this.settings.rootNotePath) as TFile; // | null;
		// if (!rootFile) {
		// 	// TODO: file exists but was not loaded yet
		// 	console.error("Root file not found at path:", this.settings.rootNotePath);
		// 	return; // Exit early if the root file is not found
		// }
		const lastTrackerTime = null; // await this.frontMatterManager.getLastTrackerTimeRegex(rootFile) as string;
		this.pluginLoadTime = lastTrackerTime ? new Date(lastTrackerTime).getTime() : Date.now();
		this.registerEvent(
			this.app.vault.on("create", async (file: TFile) => {
				if (file instanceof TFile && file.stat) {
					if (file.stat.ctime > this.pluginLoadTime) {
						await delay(0);
						await this.commandHandler.handleFileCreation(file);
					}
				}
			})
		);

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

	scheduleComputeTimeTree(): void {
		// Clear any existing interval
		if (this.computeIntervalHandle) {
			clearInterval(this.computeIntervalHandle);
		}
		// Only schedule if the compute interval is greater than 0 (enabled)
		if (this.settings.computeIntervalMinutes > 0) {
			const intervalMs = this.settings.computeIntervalMinutes * 60 * 1000;
			this.computeIntervalHandle = setInterval(async () => {
				await this.commandHandler.computeTimeTree();
			}, intervalMs);
		}
	}
}
