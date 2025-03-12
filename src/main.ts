import { MarkdownRenderChild, Plugin, TFile, Notice } from "obsidian";
import { defaultSettings, TimeTreeSettings } from "./settings";
import { TimeTreeSettingsTab } from "./settings-tab";
import * as YAML from "yaml";

export default class TimeTreePlugin extends Plugin {
    public api = (this.app as any).plugins.plugins["simple-time-tracker"].api;
    public settings: TimeTreeSettings;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.addSettingTab(new TimeTreeSettingsTab(this.app, this));
        
		this.addCommand({
            id: "elapsed-time",
            name: "Elapsed time of the current note",
            callback: async () => {
                await this.elapsedTime();
            },
        });

        this.addCommand({
            id: "elapsed-time-childs",
            name: "Accumulated elapsed time of child notes",
            callback: async () => {
                await this.elapsedChilds();
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

        const trackers = await this.api.loadAllTrackers(activeFile.path);
        if (!trackers || trackers.length === 0) {
            new Notice("No time trackers found in this file.");
            return;
        }

        // Sum up the total duration.
        let totalDuration = 0;
        if (this.settings.onlyFirstTracker && trackers.length > 0) {
            totalDuration = this.api.getTotalDuration(
                trackers[0].tracker.entries
            );
        } else {
            for (const { tracker } of trackers) {
                totalDuration += this.api.getTotalDuration(tracker.entries);
            }
        }

        await this.updateFileFrontmatter(activeFile, (frontmatter) => {
            frontmatter.elapsed = totalDuration;
            return frontmatter;
        });
        new Notice(`Updated elapsed time: ${totalDuration}`);
    }

    async elapsedChilds(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            console.log("No active file.");
            return;
        }

        let elapsedChildSum = 0;

        // Retrieve the file's metadata cache to get its outgoing links
        const fileCache = this.app.metadataCache.getFileCache(activeFile);
        if (!fileCache || !fileCache.links) {
            await this.updateFileFrontmatter(activeFile, (frontmatter) => {
                frontmatter.elapsed_child = 0;
                new Notice("Leaf note: updated elapsed_child to 0.");
                return frontmatter;
            });
            return;
        }

        for (const link of fileCache.links) {
            const childFile = this.app.metadataCache.getFirstLinkpathDest(
                link.link,
                activeFile.path
            );
            if (childFile) {
                for (const property of ["elapsed", "elapsed_child"]) {
                    const val = await this.getProperty(childFile, property);
                    if (val !== undefined) {
                        elapsedChildSum += val;
                    }
                }
            } else {
                console.log(
                    `Could not resolve child file for link: ${link.link}`
                );
            }
        }

        await this.updateFileFrontmatter(activeFile, (frontmatter) => {
            frontmatter.elapsed_child = elapsedChildSum;
            return frontmatter;
        });
        new Notice(`Updated elapsed_child: ${elapsedChildSum}`);
    }

    /**
     * Recursively calculates the total elapsed_child time for a given note.
     *
     * @param file - The TFile for which to calculate the elapsed_child.
     * @returns The total elapsed time from the note's descendants (including direct elapsed times).
     */
    async calculateRecursiveElapsedChild(file: TFile): Promise<number> {
        // Read the file content to parse its YAML frontmatter
        const content = await this.app.vault.read(file);
        const yamlRegex = /^---\n([\s\S]*?)\n---/;
        const yamlMatch = content.match(yamlRegex);
        let frontmatter = yamlMatch ? YAML.parse(yamlMatch[1]) || {} : {};
        const ownElapsed = frontmatter.elapsed || 0;

        // Retrieve outgoing links from the file's metadata
        const fileCache = this.app.metadataCache.getFileCache(file);
        if (!fileCache || !fileCache.links || fileCache.links.length === 0) {
            // Leaf node: update elapsed_child as 0 and return own elapsed time
            await this.updateFileFrontmatter(file, (fm) => {
                fm.elapsed_child = 0;
                return fm;
            });
            return ownElapsed;
        }

        // Initialize sum for all child contributions
        let totalDescendantElapsed = 0;

        // Process each link (child note)
        for (const link of fileCache.links) {
            const childFile = this.app.metadataCache.getFirstLinkpathDest(
                link.link,
                file.path
            );
            if (childFile) {
                // Recursively calculate child's elapsed (which includes its own elapsed_child)
                const childTotal = await this.calculateRecursiveElapsedChild(
                    childFile
                );
                totalDescendantElapsed += childTotal;
            } else {
                console.log(
                    `Could not resolve child file for link: ${link.link}`
                );
            }
        }

        // Update current note's YAML frontmatter: elapsed_child = sum of all descendant elapsed times
        await this.updateFileFrontmatter(file, (fm) => {
            fm.elapsed_child = totalDescendantElapsed;
            return fm;
        });

        // Return this note's total elapsed value (own elapsed plus all descendants)
        return ownElapsed + totalDescendantElapsed;
    }

    // Modified elapsedChilds function starting from the active file
    async elapsedChildsRecursive(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            console.log("No active file.");
            return;
        }

        // Calculate total elapsed for the active file (this will update all descendant notes recursively)
        const totalElapsed = await this.api.calculateRecursiveElapsedChild(activeFile);

        // Optionally, update the active file's frontmatter or show a Notice
        new Notice(
            `Updated elapsed_child for active note: ${
                totalElapsed - ((await this.getProperty(activeFile, "elapsed")) || 0)
            }`
        );
    }

    private async getProperty(
        file: TFile,
        property: string
    ): Promise<number | undefined> {
        try {
            const content = await this.app.vault.read(file);
            const yamlRegex = /^---\n([\s\S]*?)\n---/;
            const yamlMatch = content.match(yamlRegex);
            if (yamlMatch) {
                const frontmatter = YAML.parse(yamlMatch[1]) || {};
                return frontmatter[property];
            } else {
                return undefined;
            }
        } catch (err) {
            console.error("Error reading file:", file.path, err);
            return undefined;
        }
    }

    /**
     * Helper function to update a file's YAML frontmatter using an updater callback.
     * The updater receives the current frontmatter (or an empty object if none exists),
     * and should return the updated frontmatter object.
     */
    private async updateFileFrontmatter(
        file: TFile,
        updater: (frontmatter: any) => any
    ): Promise<void> {
        let content = await this.app.vault.read(file);
        const yamlRegex = /^---\n([\s\S]*?)\n---/;
        const yamlMatch = content.match(yamlRegex);
        let newYamlBlock: string;
        try {
            let frontmatter = {};
            if (yamlMatch) {
                frontmatter = YAML.parse(yamlMatch[1]) || {};
            }
            // Apply the updater callback to modify the frontmatter
            frontmatter = updater(frontmatter);
            // Construct the YAML block without an extra trailing newline
            newYamlBlock = `---\n${YAML.stringify(frontmatter)}---`;
        } catch (e) {
            new Notice("Error parsing YAML front matter.");
            console.error(e);
            return;
        }
        let newContent: string;
        if (yamlMatch) {
            let afterYaml = content.slice(yamlMatch[0].length);
            // Ensure there's exactly one newline separating YAML and the rest of the content
            if (!afterYaml.startsWith("\n")) {
                afterYaml = "\n" + afterYaml;
            }
            newContent = newYamlBlock + afterYaml;
        } else {
            newContent = newYamlBlock + "\n" + content;
        }
        await this.app.vault.modify(file, newContent);
    }
}




