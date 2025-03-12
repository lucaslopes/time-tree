import { App, PluginSettingTab, Setting, TFolder } from "obsidian";
import TimeTreePlugin from "./main";
import { defaultSettings } from "./settings";

export class TimeTreeSettingsTab extends PluginSettingTab {
    plugin: TimeTreePlugin;

    constructor(app: App, plugin: TimeTreePlugin) {
        super(app, plugin);
        this.plugin = plugin;
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
                t.setValue(this.plugin.settings.onlyFirstTracker);
                t.onChange(async (v) => {
                    this.plugin.settings.onlyFirstTracker = v;
                    await this.plugin.saveSettings();
                });
            });
        new Setting(this.containerEl)
            .setName("Root Note Path")
            .setDesc("The path of the root note from which the commands will be executed.")
            .addText((text) => {
                text.setPlaceholder("Enter root note path")
                    .setValue(this.plugin.settings.rootNotePath)
                    .onChange(async (value) => {
                        this.plugin.settings.rootNotePath = value;
                        await this.plugin.saveSettings();
                    });

                // Create a datalist element for file suggestions
                const dataList = this.containerEl.createEl("datalist", { attr: { id: "file-datalist" } });
                const files = this.app.vault.getFiles();
                files.forEach(file => {
                    dataList.createEl("option", { attr: { value: file.path } });
                });
                text.inputEl.setAttr("list", "file-datalist");
            });
        new Setting(this.containerEl)
            .setName("Tasks Folder Path")
            .setDesc("The folder path where notes must reside to be considered during the tree-traversal over child notes linked.")
            .addText((text) => {
                text.setPlaceholder("Enter folder path")
                    .setValue(this.plugin.settings.childNotesFolderPath)
                    .onChange(async (value) => {
                        this.plugin.settings.childNotesFolderPath = value;
                        await this.plugin.saveSettings();
                    });

                // Create a datalist element for folder suggestions using all folders from the vault recursively
                const folderDataList = this.containerEl.createEl("datalist", { attr: { id: "folder-datalist" } });
                const rootFolder = this.app.vault.getRoot();
                const allFolders: TFolder[] = [];
                
                function traverse(folder: TFolder) {
                    allFolders.push(folder);
                    if (folder.children) {
                        folder.children.forEach(child => {
                            if (child instanceof TFolder) {
                                traverse(child);
                            }
                        });
                    }
                }
                
                traverse(rootFolder);
                
                Array.from(allFolders.map(f => f.path))
                    .sort()
                    .forEach(folderPath => {
                        folderDataList.createEl("option", { attr: { value: folderPath } });
                    });

                text.inputEl.setAttr("list", "folder-datalist");
            });
        new Setting(this.containerEl)
            .setName("Consider Subdirs")
            .setDesc(
                "If enabled, consider all notes in subdirectories of the 'Tasks Folder'. If disabled, only consider notes that have the folder as direct parent."
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.recursiveChildNotes);
                toggle.onChange(async (value) => {
                    this.plugin.settings.recursiveChildNotes = value;
                    await this.plugin.saveSettings();
                });
            });
    }
}
