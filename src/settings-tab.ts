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
			"Time Folder",
			"The folder path where notes must reside to be considered as time entries.",
			this.settings.TimeFolderPath,
			async (value) => {
				this.settings.TimeFolderPath = value;
				await this.plugin.saveSettings();
			}
		);
		
		createPathSetting(
			this.app,
			this.containerEl,
			"Tree Folder",
			"The folder path where notes must reside to be considered as tasks.",
			this.settings.TreeFolderPath,
			async (value) => {
				this.settings.TreeFolderPath = value;
				await this.plugin.saveSettings();
			}
		);

		createPathSetting(
			this.app,
			this.containerEl,
			"Root Note",
			"The path of the root note from which the commands will be executed.",
			this.settings.rootNotePath,
			async (value) => {
				this.settings.rootNotePath = value;
				await this.plugin.saveSettings();
			},
			true // Indicate that this is a file path
		);
		
		new Setting(this.containerEl)
			.setName("Auto Update")
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
