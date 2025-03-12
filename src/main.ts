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
			name: "Update elapsed time of the current note",
			callback: async () => {
				await this.elapsedTime();
			},
		});

		this.addCommand({
			id: "compute-time-tree",
			name: "Compute hierarchical elapsed time from root note",
			callback: async () => {
				await this.computeTimeTree();
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

	/**
	 * Helper function to read a file's YAML frontmatter and extract a specific property.
	 * Returns undefined if the property is not found or if the frontmatter is invalid.
	 */
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

	async elapsedTime(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active file found.");
			return;
		}

		const elapsed = await this.calculateElapsedTime(activeFile);
		await this.communicateAscendants(activeFile);

		const rootPath = this.settings.rootNotePath;
		if (rootPath) {
			const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
			if (rootFile && rootFile instanceof TFile) {
				await this.updateNodeSizeFromFile(rootFile);
			}
		}

		new Notice(`Updated elapsed time: ${elapsed}`);
	}

	async calculateElapsedTime(file: TFile): Promise<number> {
		// Calculate local elapsed time from trackers
		const trackers = await this.api.loadAllTrackers(file.path);
		let localElapsed = 0;
		if (trackers && trackers.length > 0) {
			if (this.settings.onlyFirstTracker) {
				localElapsed = this.api.getTotalDuration(
					trackers[0].tracker.entries
				);
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

		return localElapsed;
	}

	async calculateRecursiveElapsedTime(file: TFile): Promise<number> {
		// Calculate local elapsed time of the file
		let localElapsed = await this.calculateElapsedTime(file);

		// Recursively process child files to calculate their elapsed time
		const fileCache = this.app.metadataCache.getFileCache(file);
		if (fileCache && fileCache.links && fileCache.links.length > 0) {
			for (const link of fileCache.links) {
				const childFile = this.app.metadataCache.getFirstLinkpathDest(
					link.link,
					file.path
				);
				if (childFile) {
					await this.calculateRecursiveElapsedTime(childFile);
				}
			}
		}

		return localElapsed;
	}

	/**
	 * Recursively calculates the total elapsed_child time for a given note.
	 *
	 * @param file - The TFile for which to calculate the elapsed_child.
	 * @returns The total elapsed time from the note's descendants (including direct elapsed times).
	 */
	async calculateRecursiveElapsedChild(
		file: TFile,
		recursive: boolean = true,
		includeOwn: boolean = true
	): Promise<number> {
		// Read the file content to parse its YAML frontmatter
		const content = await this.app.vault.read(file);
		const yamlRegex = /^---\n([\s\S]*?)\n---/;
		const yamlMatch = content.match(yamlRegex);
		let frontmatter = yamlMatch ? YAML.parse(yamlMatch[1]) || {} : {};
		const ownElapsed = frontmatter.elapsed || 0;

		// Retrieve outgoing links from the file's metadata
		const fileCache = this.app.metadataCache.getFileCache(file);
		if (!fileCache || !fileCache.links || fileCache.links.length === 0) {
			const properties =
				ownElapsed == 0
					? ["elapsed", "elapsed_child"]
					: ["elapsed_child"];
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
				let childTotal = 0;
				if (recursive) {
					// Recursively calculate child's elapsed (which includes its own elapsed_child)
					childTotal = await this.calculateRecursiveElapsedChild(
						childFile
					);
				} else {
					const childElapsed =
						(await this.getProperty(childFile, "elapsed")) || 0;
					const childElapsedChilds =
						(await this.getProperty(childFile, "elapsed_child")) ||
						0;
					childTotal = childElapsed + childElapsedChilds;
				}
				totalDescendantElapsed += childTotal;
			}
		}

		// Update current note's YAML frontmatter: elapsed_child = sum of all descendant elapsed times
		await this.updateProperty(file, (fm) => {
			fm.elapsed_child = totalDescendantElapsed;
			return fm;
		});

		const total = includeOwn
			? ownElapsed + totalDescendantElapsed
			: totalDescendantElapsed;
		return total;
	}

	async communicateAscendants(file: TFile): Promise<void> {
		const parent = await this.getParentFile(file);
		if (parent) {
			const parentElapsedChild =
				await this.calculateRecursiveElapsedChild(parent, false, false);
			await this.updateProperty(parent, (fm) => {
				fm.elapsed_child = parentElapsedChild;
				return fm;
			});
			await this.communicateAscendants(parent);
		}
		return;
	}

	/**
	 * Gathers the oldest parent file from a given file by checking its backlinks.
	 */
	async getParentFile(file: TFile): Promise<TFile | undefined> {
		const backlinks = (this.app.metadataCache as any).getBacklinksForFile(
			file
		);
		let candidateFiles: TFile[] = [];

		for (const source of backlinks["data"]) {
			const parentFile = this.app.vault.getAbstractFileByPath(source[0]);
			if (parentFile instanceof TFile) {
				if (this.settings.RootFolderPath) {
					if (this.settings.considerSubdirs) {
						if (
							!parentFile.path.startsWith(
								this.settings.RootFolderPath
							)
						)
							continue;
					} else {
						if (
							(parentFile as any).parent?.path !==
							this.settings.RootFolderPath
						)
							continue;
					}
				}
				candidateFiles.push(parentFile);
			}
		}

		if (candidateFiles.length === 0) {
			return;
		}

		let oldestFile = candidateFiles[0];
		for (const candidate of candidateFiles) {
			if (candidate.stat.ctime < oldestFile.stat.ctime) {
				oldestFile = candidate;
			}
		}

		return oldestFile;
	}

	/**
	 * Recursively gathers all descendant files from a given file by following its links.
	 */
	async gatherDescendantFiles(
		file: TFile,
		visited: Set<string> = new Set()
	): Promise<TFile[]> {
		let files: TFile[] = [];
		if (visited.has(file.path)) {
			return files;
		}
		visited.add(file.path);
		const fileCache = this.app.metadataCache.getFileCache(file);
		if (fileCache && fileCache.links && fileCache.links.length > 0) {
			for (const link of fileCache.links) {
				const childFile = this.app.metadataCache.getFirstLinkpathDest(
					link.link,
					file.path
				);
				if (childFile) {
					if (this.settings.RootFolderPath) {
						if (this.settings.considerSubdirs) {
							// If recursive is enabled, consider all notes that are in subdirectories of the specified folder
							if (
								!childFile.path.startsWith(
									this.settings.RootFolderPath
								)
							) {
								continue;
							}
						} else {
							// If recursive is disabled, only consider notes that have the Root Folder Path as their direct parent
							if (
								(childFile as any).parent.path !==
								this.settings.RootFolderPath
							) {
								continue;
							}
						}
					}
					files.push(childFile);
					const descendants = await this.gatherDescendantFiles(
						childFile,
						visited
					);
					files.push(...descendants);
				}
			}
		}
		return files;
	}

	async computeTimeTree(): Promise<void> {
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
		const totalElapsedChild = await this.calculateRecursiveElapsedChild(
			rootFile
		);
		const ownElapsed = (await this.getProperty(rootFile, "elapsed")) || 0;
		new Notice(
			`Updated elapsed_child for root note: ${
				totalElapsedChild - ownElapsed
			}`
		);

		// Process node sizes from the root note and its descendants
		await this.updateNodeSizeFromFile(rootFile);
	}

	async updateNodeSizeFromFile(file: TFile): Promise<void> {
		// Gather all descendant files from the file note
		const descendantFiles = await this.gatherDescendantFiles(file);
		const files = [file, ...descendantFiles];

		// Compute accumulated elapsed values for each file
		const accValues: { file: TFile; acc: number }[] = [];
		for (const file of files) {
			const elapsed = (await this.getProperty(file, "elapsed")) || 0;
			const elapsedChild =
				(await this.getProperty(file, "elapsed_child")) || 0;
			const acc = elapsed + elapsedChild;
			accValues.push({ file, acc });
		}

		const accNumbers = accValues.map((item) => item.acc);
		const minAcc = Math.min(...accNumbers);
		const maxAcc = Math.max(...accNumbers);

		const min_d = 6;
		const max_d = 100;
		const A_min = min_d * min_d; // 36
		const A_max = max_d * max_d; // 10000

		for (const { file, acc } of accValues) {
			let node_size: number;
			if (maxAcc === minAcc) {
				node_size = acc === 0 ? min_d : max_d;
			} else {
				const A =
					A_min +
					((acc - minAcc) / (maxAcc - minAcc)) * (A_max - A_min);
				node_size = Math.sqrt(A);
			}
			await this.updateProperty(file, (frontmatter) => {
				frontmatter.node_size = node_size;
				return frontmatter;
			});
		}
	}
}
