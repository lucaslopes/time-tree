import {
	Plugin,
	Notice,
	TFile,
	PluginSettingTab,
	App,
	Setting,
} from "obsidian";
import * as YAML from "yaml";

interface UpdateElapsedPluginSettings {
	onlyFirstTracker: boolean;
}

const DEFAULT_SETTINGS: UpdateElapsedPluginSettings = {
	onlyFirstTracker: false,
};

export default class UpdateelapsedPlugin extends Plugin {
	settings: UpdateElapsedPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "update-accumulated-time",
			name: "Update Accumulated Time from Time Tracker",
			callback: async () => {
				await this.updateActiveFileMetadata();
			},
		});

		this.addSettingTab(new UpdateelapsedSettingTab(this.app, this));
	}

	/**
	 * Updates the YAML frontmatter of the active file with the total accumulated time
	 * retrieved using the Super Simple Time Tracker plugin's API.
	 */
	async updateActiveFileMetadata() {
		const activeFile: TFile | null = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active file found.");
			return;
		}

		// Get the time tracker plugin API (cast this.app to any to bypass type errors)
		const trackerPlugin = (this.app as any).plugins.plugins[
			"simple-time-tracker"
		];
		if (!trackerPlugin || !trackerPlugin.api) {
			new Notice("Time tracker plugin API not found.");
			return;
		}
		const api = trackerPlugin.api;

		// Load all trackers for the active file.
		const trackers = await api.loadAllTrackers(activeFile.path);
		if (!trackers || trackers.length === 0) {
			new Notice("No time trackers found in this file.");
			return;
		}

		// Sum up the total duration. Pass the current time to include running segments.
		let totalDuration = 0;
		if (this.settings.onlyFirstTracker && trackers.length > 0) {
			// Only consider the first tracker
			totalDuration = api.getTotalDuration(
				trackers[0].tracker.entries,
				new Date()
			);
		} else {
			// Sum durations from all trackers
			for (const { tracker } of trackers) {
				const duration = api.getTotalDuration(
					tracker.entries,
					new Date()
				);
				totalDuration += duration;
			}
		}

		// Read the file content and update (or add) YAML frontmatter.
		let content = await this.app.vault.read(activeFile);
		const yamlRegex = /^---\n([\s\S]*?)\n---/;
		let newYamlBlock: string;
		const yamlMatch = content.match(yamlRegex);
		if (yamlMatch) {
			try {
				let frontmatter = YAML.parse(yamlMatch[1]) || {};
				frontmatter.elapsed = totalDuration;
				newYamlBlock = `---\n${YAML.stringify(frontmatter)}---\n`;
			} catch (e) {
				new Notice("Error parsing YAML front matter.");
				return;
			}
		} else {
			// No YAML front matter exists; create one.
			newYamlBlock = `---\nelapsed: ${totalDuration}\n---\n`;
		}

		// If YAML was already present, replace it; otherwise, prepend the new YAML.
		let newContent: string;
		if (yamlMatch) {
			newContent = newYamlBlock + content.slice(yamlMatch[0].length);
		} else {
			newContent = newYamlBlock + content;
		}

		await this.app.vault.modify(activeFile, newContent);
		new Notice(`Updated elapsed time: ${totalDuration}`);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		// Cleanup if necessary.
	}
}

class UpdateelapsedSettingTab extends PluginSettingTab {
	plugin: UpdateelapsedPlugin;

	constructor(app: App, plugin: UpdateelapsedPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Update Elapsed Plugin Settings" });

		new Setting(containerEl)
			.setName("Only First Tracker")
			.setDesc(
				"When enabled, only the first tracker in the file will be used to compute elapsed time."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.onlyFirstTracker)
					.onChange(async (value) => {
						this.plugin.settings.onlyFirstTracker = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
