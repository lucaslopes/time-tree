import { App, PluginSettingTab, Setting } from "obsidian";
import TimeTreePlugin from "./main";
import { TimeTreeSettings } from "./settings";
import { createPathSetting } from "./utils";

export class TimeTreeSettingsTab extends PluginSettingTab {
	plugin: TimeTreePlugin;
	settings: TimeTreeSettings;

	constructor(app: App, plugin: TimeTreePlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.settings = plugin.settings;
	}

	display(): void {
		this.containerEl.empty();
		this.containerEl.createEl("h2", {
			text: "Time Tree Settings",
		});

		createPathSetting(
			this.app,
			this.containerEl,
			"Root Note Path",
			"The path of the root note from which the commands will be executed.",
			this.settings.rootNotePath,
			async (value) => {
				this.settings.rootNotePath = value;
				await this.plugin.saveSettings();
			},
			true // Indicate that this is a file path
		);

		createPathSetting(
			this.app,
			this.containerEl,
			"Root Folder Path",
			"The folder path where notes must reside to be considered during the tree-traversal over child notes linked.",
			this.settings.RootFolderPath,
			async (value) => {
				this.settings.RootFolderPath = value;
				await this.plugin.saveSettings();
			}
		);

		createPathSetting(
			this.app,
			this.containerEl,
			"Target Folder Path",
			"The folder path where new file creation events will be listened for.",
			this.settings.targetFolderPath,
			async (value) => {
				this.settings.targetFolderPath = value;
				await this.plugin.saveSettings();
			}
		);

		new Setting(this.containerEl)
			.setName("Compute Interval")
			.setDesc(
				"Set the periodic interval to run the 'compute-time-tree' command. Select 'Off' to disable."
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("0", "Off");
				dropdown.addOption("1", "1 minute");
				dropdown.addOption("15", "15 minutes");
				dropdown.addOption("30", "30 minutes");
				dropdown.addOption("60", "1 hour");
				dropdown.addOption("360", "6 hours");
				dropdown.addOption("720", "12 hours");
				dropdown.addOption("1440", "24 hours");
				dropdown.setValue(
					this.settings.computeIntervalMinutes.toString()
				);
				dropdown.onChange(async (value) => {
					this.settings.computeIntervalMinutes = parseInt(value);
					await this.plugin.saveSettings();
				});
			});
	}
}
