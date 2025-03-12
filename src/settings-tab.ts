import { App, PluginSettingTab, Setting } from "obsidian";
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
    }
}
