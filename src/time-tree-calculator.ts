import { App, TFile, Notice } from "obsidian";
import { TimeTreeSettings } from "./settings";
import { FrontMatterManager } from "./front-matter-manager";

export async function gatherDescendantFiles(
	file: TFile,
	app: App,
	visited: Set<string> = new Set()
): Promise<TFile[]> {
	let files: TFile[] = [];
	if (visited.has(file.path)) {
		return files;
	}
	visited.add(file.path);
	const fileCache = app.metadataCache.getFileCache(file);
	if (fileCache && fileCache.links && fileCache.links.length > 0) {
		for (const link of fileCache.links) {
			const childFile = app.metadataCache.getFirstLinkpathDest(
				link.link,
				file.path
			);
			if (childFile) {
				files.push(childFile);
				const descendants = await gatherDescendantFiles(
					childFile,
					app,
					visited
				);
				files.push(...descendants);
			}
		}
	}
	return files;
}

export class TimeTreeCalculator {
	private app: App;
	private settings: TimeTreeSettings;
	private api: any;
	private frontMatterManager: FrontMatterManager;

	constructor(
		app: App,
		settings: TimeTreeSettings,
		api: any,
		frontMatterManager: FrontMatterManager
	) {
		this.app = app;
		this.settings = settings;
		this.api = api;
		this.frontMatterManager = frontMatterManager;
	}

	async calculateElapsedTime(file: TFile): Promise<number> {
		const trackers = await this.api.loadAllTrackers(file.path);
		let localElapsed = 0;
		if (trackers && trackers.length > 0) {
			localElapsed = this.api.getTotalDuration(
				trackers[0].tracker.entries
			);
		}
		return localElapsed;
	}

	async calculateRecursiveElapsedTime(file: TFile): Promise<number> {
		let localElapsed = await this.calculateElapsedTime(file);
		await this.frontMatterManager.updateProperty(file, (frontmatter) => {
			frontmatter.elapsed = localElapsed;
			return frontmatter;
		});
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

	async calculateRecursiveElapsedChild(
		file: TFile,
		recursive: boolean = true
	): Promise<number> {
		const ownElapsed = (await this.frontMatterManager.getProperty(
			file,
			"elapsed"
		)) as number;
		const fileCache = this.app.metadataCache.getFileCache(file);
		const childNotes = (fileCache as any).links;
		const leafNote = !fileCache || !childNotes || childNotes.length === 0;
		if (leafNote) {
			const properties =
				ownElapsed === 0 ? ["elapsed", "descendants"] : ["descendants"];
			for (const property of properties) {
				await this.frontMatterManager.updateProperty(file, (fm) => {
					fm[property] = 0;
					return fm;
				});
			}
			return ownElapsed;
		}
		let totalDescendantElapsed = 0;
		for (const link of childNotes) {
			const childFile = this.app.metadataCache.getFirstLinkpathDest(
				link.link,
				file.path
			);
			if (childFile) {
				let childTotal = 0;
				if (recursive) {
					childTotal = await this.calculateRecursiveElapsedChild(
						childFile
					);
				} else {
					const childElapsed =
						(await this.frontMatterManager.getProperty(
							childFile,
							"elapsed"
						)) as number;
					const childElapsedChilds =
						(await this.frontMatterManager.getProperty(
							childFile,
							"descendants"
						)) as number;
					childTotal = childElapsed + childElapsedChilds;
				}
				totalDescendantElapsed += childTotal;
			}
		}
		await this.frontMatterManager.updateProperty(file, (fm) => {
			fm.descendants = totalDescendantElapsed;
			return fm;
		});
		return ownElapsed + totalDescendantElapsed;
	}

	async communicateAscendants(file: TFile): Promise<void> {
		const parent = await this.getParentFile(file);
		if (parent) {
			await this.calculateRecursiveElapsedChild(parent, false);
			await this.communicateAscendants(parent);
		}
		return;
	}

	async getParentFile(file: TFile): Promise<TFile | undefined> {
		const backlinks = (this.app.metadataCache as any).getBacklinksForFile(
			file
		);
		let candidateFiles: TFile[] = [];
		for (const source of backlinks["data"]) {
			const parentFile = this.app.vault.getAbstractFileByPath(source[0]);
			if (parentFile instanceof TFile) {
				if (this.settings.RootFolderPath) {
					if (
						!parentFile.path.startsWith(
							this.settings.RootFolderPath
						)
					) {
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

	async updateNodeSizeFromFile(file: TFile): Promise<void> {
		const descendantFiles = await gatherDescendantFiles(file, this.app);
		const files = [file, ...descendantFiles];
		const accValues: { file: TFile; acc: number }[] = [];
		for (const file of files) {
			const elapsed = (await this.frontMatterManager.getProperty(
				file,
				"elapsed"
			)) as number;
			const elapsedChild = (await this.frontMatterManager.getProperty(
				file,
				"descendants"
			)) as number;
			const acc = elapsed + elapsedChild;
			accValues.push({ file, acc });
		}
		const accNumbers = accValues.map((item) => item.acc);
		const minAcc = 0;
		const maxAcc = Math.max(...accNumbers);
		const min_d = 6;
		const max_d = 100;
		const A_min = min_d * min_d;
		const A_max = max_d * max_d;
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
			node_size = Math.round((node_size + Number.EPSILON) * 100) / 100;
			await this.frontMatterManager.updateProperty(
				file,
				(frontmatter) => {
					frontmatter.node_size =
						typeof node_size === "number" ? node_size : min_d;
					return frontmatter;
				}
			);
		}
	}
}
