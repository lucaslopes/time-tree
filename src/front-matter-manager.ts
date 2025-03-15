import { TFile, Notice, App, Editor } from "obsidian";
import * as YAML from "yaml";

export class FrontMatterManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	async getProperty(file: TFile, property: string): Promise<number> {
		let propertyValue = 0;
		try {
			const content = await this.app.vault.read(file);
			const yamlRegex = /^---\n([\s\S]*?)\n---/;
			const yamlMatch = content.match(yamlRegex);
			if (yamlMatch) {
				const frontmatter = YAML.parse(yamlMatch[1]) || {};
				propertyValue = (frontmatter[property] || 0) as number;
			}
		} catch (err) {
			console.error("Error reading file:", file.path, err);
		}
		return propertyValue;
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

	// Helper function to find the end of YAML front matter (line L is the last YAML line).
	getYamlEnd = (lines: string[]): number => {
		let yamlEnd = 0;
		if (lines[0].trim() === "---") {
			for (let i = 1; i < lines.length; i++) {
				if (lines[i].trim() === "---") {
					yamlEnd = i + 1;
					break;
				}
			}
		}
		return yamlEnd;
	};

	// Helper function to collect tracker block boundaries after the YAML front matter.
	getTrackerBlocks = (
		lines: string[],
		start: number
	): { start: number; end: number }[] => {
		const blocks: { start: number; end: number }[] = [];
		for (let i = start; i < lines.length; i++) {
			if (lines[i].trimEnd() === "```simple-time-tracker") {
				const blockStart = i;
				for (let j = i + 1; j < lines.length; j++) {
					if (lines[j].trimEnd() === "```") {
						blocks.push({ start: blockStart, end: j });
						i = j; // Skip the rest of this block
						break;
					}
				}
			}
		}
		return blocks;
	};

	// Helper function to check if a given line index is inside any tracker block.
	isLineInTracker = (
		line: number,
		blocks: { start: number; end: number }[]
	): boolean => {
		return blocks.some((block) => line >= block.start && line <= block.end);
	};

	// Helper function to find the first line after YAML that is not within any tracker block.
	findTargetLine = (
		lines: string[],
		yamlEnd: number,
		blocks: { start: number; end: number }[]
	): number => {
		let target = yamlEnd;
		while (target < lines.length && this.isLineInTracker(target, blocks)) {
			target++;
		}
		if (target >= lines.length) {
			target = lines.length - 1;
		}
		return target;
	};

	async adjustCursorOutsideTracker(editor: Editor): Promise<void> {
		const content = editor.getValue();
		const lines = content.split("\n");

		const yamlEnd = this.getYamlEnd(lines);
		const trackerBlocks = this.getTrackerBlocks(lines, yamlEnd);
		const targetLine = this.findTargetLine(lines, yamlEnd, trackerBlocks);

		const cursor = editor.getCursor();
		if (!this.isLineInTracker(cursor.line, trackerBlocks)) {
			return;
		}

		editor.setCursor({ line: targetLine, ch: 0 });
	}
}
