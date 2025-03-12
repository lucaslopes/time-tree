import { Plugin, TFile, Notice } from "obsidian";
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

        this.addCommand({
            id: "update-node-size",
            name: "Update Node Size",
            callback: async () => {
                await this.updateNodeSizeCommand();
            },
        });
        this.addCommand({
            id: "process-from-root",
            name: "Process Commands from Root Note",
            callback: async () => {
                await this.processFromRoot();
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

        // Recursively calculate elapsed time for active file and its descendants
        const totalElapsed = await this.calculateRecursiveElapsedTime(activeFile);
        new Notice(`Updated recursive elapsed time: ${totalElapsed}`);
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
            const properties = ownElapsed == 0 ? ["elapsed", "elapsed_child"] : ["elapsed_child"]
            for (const property of properties) {
                await this.updateProperty(file, (fm) => {
                    fm[property] = 0;
                    return fm;
                });
            }
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
            }
        }

        // Update current note's YAML frontmatter: elapsed_child = sum of all descendant elapsed times
        await this.updateProperty(file, (fm) => {
            fm.elapsed_child = totalDescendantElapsed;
            return fm;
        });

        // Return this note's total elapsed value (own elapsed plus all descendants)
        return ownElapsed + totalDescendantElapsed;
    }

    async calculateRecursiveElapsedTime(file: TFile): Promise<number> {
        // Calculate local elapsed time from trackers
        const trackers = await this.api.loadAllTrackers(file.path);
        let localElapsed = 0;
        if (trackers && trackers.length > 0) {
            if (this.settings.onlyFirstTracker) {
                localElapsed = this.api.getTotalDuration(trackers[0].tracker.entries);
            } else {
                for (const { tracker } of trackers) {
                    localElapsed += this.api.getTotalDuration(tracker.entries);
                }
            }
        }

        // Update the file's 'elapsed' property with the local elapsed time
        await this.updateProperty(file, (frontmatter) => {
            frontmatter.elapsed = localElapsed;
            return frontmatter;
        });

        // Recursively process child files to calculate their elapsed time
        const fileCache = this.app.metadataCache.getFileCache(file);
        if (fileCache && fileCache.links && fileCache.links.length > 0) {
            for (const link of fileCache.links) {
                const childFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                if (childFile) {
                    await this.calculateRecursiveElapsedTime(childFile);
                }
            }
        }

        return localElapsed
    }

    // Modified elapsedChilds function starting from the active file
    async elapsedChilds(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("No active file.");
            return;
        }

        // Calculate total elapsed for the active file (this will update all descendant notes recursively)
        const totalElapsed = await this.calculateRecursiveElapsedChild(activeFile);

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
    private async updateProperty(
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

    /**
     * Recursively gathers all descendant files from a given file by following its links.
     */
    async gatherDescendantFiles(file: TFile, visited: Set<string> = new Set()): Promise<TFile[]> {
        let files: TFile[] = [];
        if (visited.has(file.path)) {
            return files;
        }
        visited.add(file.path);
        const fileCache = this.app.metadataCache.getFileCache(file);
        if (fileCache && fileCache.links && fileCache.links.length > 0) {
            for (const link of fileCache.links) {
                const childFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                if (childFile) {
                    files.push(childFile);
                    const descendants = await this.gatherDescendantFiles(childFile, visited);
                    files.push(...descendants);
                }
            }
        }
        return files;
    }

    /**
     * Updates the node_size property for notes in the active file's tree based on the sum of
     * 'elapsed' and 'elapsed_child'. The maximum node_size (100) corresponds to the maximum
     * (elapsed+elapsed_child) value in the tree, and the minimum node_size (6) is for notes with 0.
     */
    async updateNodeSizeCommand(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice("No active file found.");
            return;
        }
        // Gather all descendant files from the active file.
        const descendantFiles = await this.gatherDescendantFiles(activeFile);
        // Include the active file in the list.
        const files = [activeFile, ...descendantFiles];
        
        // Compute accumulated time for each file: elapsed + elapsed_child.
        const accValues: { file: TFile, acc: number }[] = [];
        for (const file of files) {
            const elapsed = await this.getProperty(file, "elapsed") || 0;
            const elapsedChild = await this.getProperty(file, "elapsed_child") || 0;
            const acc = elapsed + elapsedChild;
            accValues.push({ file, acc });
        }
        
        // Determine min and max accumulated values among the files.
        const accNumbers = accValues.map(item => item.acc);
        const minAcc = Math.min(...accNumbers);
        const maxAcc = Math.max(...accNumbers);
        
        const min_d = 6;
        const max_d = 100;
        const A_min = min_d * min_d;  // 36
        const A_max = max_d * max_d;  // 10000
        
        for (const { file, acc } of accValues) {
            let node_size: number;
            if (maxAcc === minAcc) {
                // If all accumulated values are equal, assign based on the value:
                node_size = (acc === 0) ? min_d : max_d;
            } else {
                const A = A_min + ((acc - minAcc) / (maxAcc - minAcc)) * (A_max - A_min);
                node_size = Math.sqrt(A);
            }
            // Update the file's YAML frontmatter with the node_size property
            await this.updateProperty(file, (frontmatter) => {
                frontmatter.node_size = node_size;
                return frontmatter;
            });
        }
        
        new Notice("Node sizes updated for the active file and its descendants.");
    }
    async processFromRoot(): Promise<void> {
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

        // Process elapsed time from the root note
        const localElapsed = await this.calculateRecursiveElapsedTime(rootFile);
        new Notice(`Updated recursive elapsed time: ${localElapsed}`);

        // Process elapsed_child from the root note
        const totalElapsedChild = await this.calculateRecursiveElapsedChild(rootFile);
        const ownElapsed = (await this.getProperty(rootFile, "elapsed")) || 0;
        new Notice(`Updated elapsed_child for root note: ${totalElapsedChild - ownElapsed}`);

        // Process node sizes from the root note and its descendants
        await this.updateNodeSizeFromRoot(rootFile);
    }

    async updateNodeSizeFromRoot(rootFile: TFile): Promise<void> {
        // Gather all descendant files from the root note
        const descendantFiles = await this.gatherDescendantFiles(rootFile);
        const files = [rootFile, ...descendantFiles];

        // Compute accumulated elapsed values for each file
        const accValues: { file: TFile, acc: number }[] = [];
        for (const file of files) {
            const elapsed = (await this.getProperty(file, "elapsed")) || 0;
            const elapsedChild = (await this.getProperty(file, "elapsed_child")) || 0;
            const acc = elapsed + elapsedChild;
            accValues.push({ file, acc });
        }

        const accNumbers = accValues.map(item => item.acc);
        const minAcc = Math.min(...accNumbers);
        const maxAcc = Math.max(...accNumbers);

        const min_d = 6;
        const max_d = 100;
        const A_min = min_d * min_d;  // 36
        const A_max = max_d * max_d;  // 10000

        for (const { file, acc } of accValues) {
            let node_size: number;
            if (maxAcc === minAcc) {
                node_size = (acc === 0) ? min_d : max_d;
            } else {
                const A = A_min + ((acc - minAcc) / (maxAcc - minAcc)) * (A_max - A_min);
                node_size = Math.sqrt(A);
            }
            await this.updateProperty(file, (frontmatter) => {
                frontmatter.node_size = node_size;
                return frontmatter;
            });
        }

        new Notice("Node sizes updated for the root note and its descendants.");
    }
}
