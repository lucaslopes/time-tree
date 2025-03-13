import { App, PluginSettingTab, Setting, TFolder } from "obsidian";
import TimeTreePlugin from "./main";
import { TimeTreeSettings } from "./settings";

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

		new Setting(this.containerEl)
			.setName("Only First Tracker")
			.setDesc(
				"Whether only the first tracker should be displayed in the tracker table."
			)
			.addToggle((t) => {
				t.setValue(this.settings.onlyFirstTracker);
				t.onChange(async (v) => {
					this.settings.onlyFirstTracker = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(this.containerEl)
			.setName("Root Note Path")
			.setDesc(
				"The path of the root note from which the commands will be executed."
			)
			.addText((text) => {
				text.setPlaceholder("Enter root note path")
					.setValue(this.settings.rootNotePath)
					.onChange(async (value) => {
						this.settings.rootNotePath = value;
						await this.plugin.saveSettings();
					});

				// Create a datalist element for file suggestions
				const dataList = this.containerEl.createEl("datalist", {
					attr: { id: "file-datalist" },
				});
				const files = this.app.vault.getFiles();
				files.forEach((file) => {
					dataList.createEl("option", { attr: { value: file.path } });
				});
				text.inputEl.setAttr("list", "file-datalist");
			});

		new Setting(this.containerEl)
			.setName("Root Folder Path")
			.setDesc(
				"The folder path where notes must reside to be considered during the tree-traversal over child notes linked."
			)
			.addText((text) => {
				text.setPlaceholder("Enter folder path")
					.setValue(this.settings.RootFolderPath)
					.onChange(async (value) => {
						this.settings.RootFolderPath = value;
						await this.plugin.saveSettings();
					});

				// Create a datalist element for folder suggestions using all folders from the vault recursively
				const folderDataList = this.containerEl.createEl("datalist", {
					attr: { id: "folder-datalist" },
				});
				const rootFolder = this.app.vault.getRoot();
				const allFolders: TFolder[] = [];

				function traverse(folder: TFolder) {
					allFolders.push(folder);
					if (folder.children) {
						folder.children.forEach((child) => {
							if (child instanceof TFolder) {
								traverse(child);
							}
						});
					}
				}

				traverse(rootFolder);

				Array.from(allFolders.map((f) => f.path))
					.sort()
					.forEach((folderPath) => {
						folderDataList.createEl("option", {
							attr: { value: folderPath },
						});
					});

				text.inputEl.setAttr("list", "folder-datalist");
			});

		new Setting(this.containerEl)
			.setName("Consider Subdirs")
			.setDesc(
				"If enabled, consider all notes in subdirectories of the 'Root Folder'. If disabled, only consider notes that have the folder as direct parent."
			)
			.addToggle((toggle) => {
				toggle.setValue(this.settings.considerSubdirs);
				toggle.onChange(async (value) => {
					this.settings.considerSubdirs = value;
					await this.plugin.saveSettings();
				});
			});

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
