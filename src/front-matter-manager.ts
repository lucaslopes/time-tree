import { TFile, Notice, App } from "obsidian";
import * as YAML from "yaml";

export class FrontMatterManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	async getProperty(
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

	async updateProperty(
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
			frontmatter = updater(frontmatter);
			newYamlBlock = `---\n${YAML.stringify(frontmatter)}---`;
		} catch (e) {
			new Notice("Error parsing YAML front matter.");
			console.error(e);
			return;
		}
		let newContent: string;
		if (yamlMatch) {
			let afterYaml = content.slice(yamlMatch[0].length);
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
