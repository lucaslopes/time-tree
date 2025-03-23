import { Plugin } from "obsidian";
import { defaultSettings, TimeTreeSettings } from "./settings";
import { TimeTreeSettingsTab } from "./settings-tab";
import { FrontMatterManager } from "./front-matter-manager";
import { TimeTreeHandler } from "./command-handler";

export default class TimeTreePlugin extends Plugin {
	public api = (this.app as any).plugins.plugins["simple-time-tracker"].api;
	public settings: TimeTreeSettings;
	private frontMatterManager: FrontMatterManager;
	private computeIntervalHandle: any;
	private buttonObserver: MutationObserver | null = null;
	private commandHandler: TimeTreeHandler;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.frontMatterManager = new FrontMatterManager(this.app);
		this.commandHandler = new TimeTreeHandler(
			this.app,
			this.api,
			this.settings,
			this.frontMatterManager
		);

		this.addSettingTab(new TimeTreeSettingsTab(this.app, this));

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
									this.commandHandler.elapsedTime();
									await delay(100);
									await this.commandHandler.updateNoteProperty(
										"status",
										"todo",
										false
									);
								} else {
									await delay(100);
									await this.commandHandler.updateNoteProperty(
										"status",
										"doing",
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
