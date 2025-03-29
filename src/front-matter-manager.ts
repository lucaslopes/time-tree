import { TFile, Notice, App, Editor } from "obsidian";
import { gatherDescendantFiles } from "./utils";
import * as YAML from "yaml";

export class FrontMatterManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	async getProperty(
		file: TFile,
		property: string
	): Promise<boolean | number | string> {
		let propertyValue: boolean | number = false;
		try {
			const content = await this.app.vault.read(file);
			const yamlRegex = /^---\n([\s\S]*?)\n---/;
			const yamlMatch = content.match(yamlRegex);
			if (yamlMatch) {
				const frontmatter = YAML.parse(yamlMatch[1]) || {};
				propertyValue = frontmatter[property] ?? false;
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
		const content = await this.app.vault.read(file);
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

	async findDoingNote(file: TFile): Promise<TFile | null> {
		let runningNotePath = await this.getProperty(file, "running") as string;
		runningNotePath = runningNotePath?.replace(/^\[\[|\]\]$/g, "").split("|")[0];
		if (runningNotePath) {
			const runningNote = this.app.vault.getAbstractFileByPath(runningNotePath);
			if (runningNote && runningNote instanceof TFile) {
				return runningNote;
			}
		}
		return this.deepFindDoingNote(file);  // TODO: is necessary?
	}

	async deepFindDoingNote(file: TFile): Promise<TFile | null> {
		const doing = await this.getProperty(file, "status");
		if (doing === 'doing') {
			return file;
		}

		// TODO: It's getting all descendant files, which is not efficient, should check one by one
		const descendants = await gatherDescendantFiles(file, this.app);
		for (const descendant of descendants) {
			const doing = await this.getProperty(descendant, "status");
			if (doing === 'doing') {
				return descendant;
			}
		}

		return null;
	}

	async loadSingleTrackerEntry(
		editor: Editor,
		position: number
	): Promise<object | null> {
		const fileContent = editor.getValue();
		
		// TODO: to known if it's running: "endTime":null}]}```
		// {"name":"*","startTime":"2025-03-23T18:06:23.907Z","endTime":null}]}

		// Match the simple-time-tracker block
		const trackerRegex = /```simple-time-tracker\n({.*?})\n```/s;
		const match = fileContent.match(trackerRegex);

		if (!match) return null;

		const trackerJson = match[1];

		// Match entries array
		const entriesRegex = /"entries":\s*\[(.*?)\]/s;
		const entriesMatch = trackerJson.match(entriesRegex);

		if (!entriesMatch) return null;

		const entriesString = entriesMatch[1];

		// Match individual entries using regex
		const entryRegex = /\{.*?"name":.*?"startTime":.*?"endTime":.*?\}/gs;
		const allEntries = [...entriesString.matchAll(entryRegex)].map(
			(m) => m[0]
		);

		if (allEntries.length === 0) return null;

		// Determine index
		const index = position >= 0 ? position : allEntries.length + position;
		if (index < 0 || index >= allEntries.length) return null;

		// Parse and return the selected entry
		return JSON.parse(allEntries[index]);
	}

	async getLastTrackerTimeRegex(file: TFile,): Promise<string | null> {
		const content = await this.app.vault.read(file);
		// Extract the dedicated simple-time-tracker block.
		// It must begin and end on its own line.
		const blockRegex = /^```simple-time-tracker\s*\n([\s\S]*?)\n```/m;
		const blockMatch = content.match(blockRegex);
		if (!blockMatch) {
			throw new Error("No dedicated simple-time-tracker block found.");
		}
		const blockContent = blockMatch[1];

		// Regex date pattern: e.g. "2025-03-12T02:18:56.038Z"
		const dateRegex = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z';

		// Regex for an entry.
		// Note: This regex assumes that entries always have the form:
		// {"name":"...","startTime":"<date>","endTime":null} OR
		// {"name":"...","startTime":"<date>","endTime":"<date>"}
		const entryRegex = new RegExp(
			`"name":\\s*"[^"]+",\\s*"startTime":\\s*"(${dateRegex})",\\s*"endTime":\\s*(null|"(${dateRegex})")`,
			"g"
		);

		let lastMatch = null;
		let match;
		while ((match = entryRegex.exec(blockContent)) !== null) {
			lastMatch = match;
		}

		if (!lastMatch) {
			return null;
		}

		// If the captured "endTime" group equals "null", return startTime; otherwise, return the date captured in group 3.
		return lastMatch[2] === 'null' ? lastMatch[1] : lastMatch[3];
	}
}
