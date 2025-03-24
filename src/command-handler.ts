import { App, TFile, Notice, Editor, MarkdownView } from "obsidian";
import { TimeTreeSettings } from "./settings";
import { FrontMatterManager } from "./front-matter-manager";
import { TimeTreeCalculator } from "./time-tree-calculator";

export class TimeTreeHandler {
	private app: App;
	private settings: TimeTreeSettings;
	private frontMatterManager: FrontMatterManager;
	private calculator: TimeTreeCalculator;

	constructor(
		app: App,
		api: any,
		settings: TimeTreeSettings,
		frontMatterManager: FrontMatterManager
	) {
		this.app = app;
		this.settings = settings;
		this.frontMatterManager = frontMatterManager;
		this.calculator = new TimeTreeCalculator(
			app,
			settings,
			api,
			frontMatterManager
		);
	}

	async startStopTracker(): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			await this.frontMatterManager.adjustCursorOutsideTracker(
				activeView.editor
			);
		} else {
			new Notice("No active Markdown editor found.");
		}
		const btn = activeView
			? (activeView.containerEl.querySelector(".simple-time-tracker-btn") as HTMLButtonElement | null)
			: null;
		if (btn) {
			btn.click();
		} else {
			new Notice("No Start/Stop button found.");
		}
	}

	async handleTrackerButtonClick(btn: HTMLButtonElement): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.containerEl.contains(btn)) {
			return;
		}
		const activeFile = this.app.workspace.getActiveFile();
		const btnStatus = btn.getAttribute("aria-label");
		const isEnd = btnStatus === "End";
		const runningValue = activeFile && !isEnd ? `[[${activeFile.basename}]]` : "";
        let status = "doing";
        if (isEnd) {
			await this.elapsedTime();
            status = "todo";
        }
		const delay = (ms: number) =>
			new Promise((resolve) => setTimeout(resolve, ms));
        await delay(100);
        await this.updateNoteProperty("status", status, false);
        
		let rootFileContent = "";
		let rootFile: TFile | null = null;
        const rootPath = this.settings.rootNotePath;
        if (rootPath) {
            rootFile = this.app.vault.getAbstractFileByPath(rootPath) as TFile;
            if (rootFile && rootFile instanceof TFile) {
                await this.updateNoteProperty("running", runningValue, false, rootFile);
				rootFileContent = await this.app.vault.read(rootFile);
            } else {
                new Notice(`Root note ${rootPath} not found.`);
            }
        } else {
            new Notice("Root note path is not configured in settings.");
        }

		if (activeFile) {
			const lastTrackerTime = await this.frontMatterManager.getLastTrackerTimeRegex(activeFile);
			let updatedContent = rootFileContent;
			const entry = { "name": "[[]]", "startTime": `${lastTrackerTime}`, "endTime": null };
		
			const trackerBlockRegex = /(```simple-time-tracker\s*\n?)([\s\S]*?)(\n```)/;
			const trackerBlockMatch = rootFileContent.match(trackerBlockRegex);
		
			if (trackerBlockMatch) {
				// Case 2: simple-time-tracker block exists
				const [_, p1, p2, p3] = trackerBlockMatch;
		
				let newContent;
				if (p2.trim()) {
					if (status == "doing") {  // When active file starts doing and buffer needs to be stopped
						updatedContent = rootFileContent.replace(
							/("endTime":\s*)null(}]})/g,  // Match the specific pattern
							`"endTime":"${lastTrackerTime}"$2`
						);
					} else {
						// Case 3: simple-time-tracker block has entries
						const entriesRegex = /"entries":\[(.*?)\]\}/s;
						const entriesMatch = p2.match(entriesRegex);
						if (entriesMatch) {
							const entriesString = entriesMatch[1];
							newContent = p2.replace(entriesString, `${entriesString},${JSON.stringify(entry)}`);
						} else {
							// TODO: what's this case?
							newContent = p2.replace(/]}/, `,${JSON.stringify(entry)}]}`);
						}
					}
				} else {
					// Case 2: simple-time-tracker block is empty
					newContent = `{"entries":[${JSON.stringify(entry)}]}`;
				}
				updatedContent = (status == "doing") ? updatedContent : rootFileContent.replace(trackerBlockRegex, `${p1}\n${newContent}${p3}`);
			} else {
				// Case 1: simple-time-tracker block does not exist
				const yamlEnd = this.frontMatterManager.getYamlEnd(rootFileContent.split("\n"));
				const beforeTrackerBlock = rootFileContent.slice(0, yamlEnd);
				const afterTrackerBlock = rootFileContent.slice(yamlEnd);
				let trackerBlock = `\n\`\`\`simple-time-tracker\n\`\`\`\n`;
				if (status != "doing") {
					trackerBlock = `\n\`\`\`simple-time-tracker\n{"entries":[${JSON.stringify(entry)}]}\n\`\`\`\n`;
				}
				// Insert the trackerBlock two lines after the second `---` (the closing yaml metadata)
				const lines = rootFileContent.split("\n");
				const secondYamlEndIndex = lines.findIndex((line, index) => line.trim() === "---" && index > 0);
				if (secondYamlEndIndex !== -1) {
					lines.splice(secondYamlEndIndex + 2, 0, trackerBlock.trim());
					updatedContent = lines.join("\n");
				} else {
					updatedContent = beforeTrackerBlock + trackerBlock + afterTrackerBlock;
				}
			}
		
			if (rootFile && rootFile instanceof TFile && updatedContent !== rootFileContent) {
				await this.app.vault.modify(rootFile, updatedContent);
			} else {
				new Notice("Root file not found or content unchanged.");
			}
		}
    }

	async elapsedTime(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active file found.");
			return;
		}
		let elapsed = 0;
		elapsed = await this.calculator.calculateElapsedTime(activeFile);
		await new Promise((resolve) => setTimeout(resolve, 10));
		await this.frontMatterManager.updateProperty(
			activeFile,
			(frontmatter) => {
				frontmatter.elapsed = elapsed;
				return frontmatter;
			}
		);
		await this.calculator.communicateAscendants(activeFile);
		const rootPath = this.settings.rootNotePath;
		if (rootPath) {
			const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
			if (rootFile && rootFile instanceof TFile) {
				await this.calculator.updateNodeSizeFromFile(rootFile);
			}
		}
		new Notice(`Updated elapsed time: ${elapsed}`);
	}

	async computeTimeTree(): Promise<void> {
		const rootPath = this.settings.rootNotePath;
		if (!rootPath) {
			new Notice(
				"Root note path is not configured in Time Tree settings."
			);
			return;
		}
		const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
		if (!rootFile || !(rootFile instanceof TFile)) {
			new Notice(`Root note ${rootPath} not found.`);
			return;
		}

		// Show a persistent loading notification
		const loadingNotice = new Notice("Computing Time Tree...", 0);
		try {
			await this.calculator.calculateRecursiveElapsedTime(rootFile);
			await this.calculator.calculateRecursiveElapsedChild(rootFile);
			await this.calculator.updateNodeSizeFromFile(rootFile);
			new Notice(`Time Tree computed from note: ${rootPath}`, 2000);
		} finally {
			loadingNotice.hide();
		}
	}
	
	async insertSubTask(editor: Editor): Promise<void> {
		let cursor = editor.getCursor();
		const currentLineText = editor.getLine(cursor.line);
		if (currentLineText.trim() !== "" || cursor.ch !== 0) {
			editor.setCursor({ line: cursor.line, ch: 0 });  // Move the cursor to the beginning of the current line
			editor.replaceRange("\n", { line: cursor.line, ch: 0 });  // Break the line at the cursor position
			cursor = { line: cursor.line, ch: 0 };  // Move the cursor to the previous line of cursor.line
			editor.setCursor(cursor);
		}
		const textToInsert = "# [[]]";
		editor.replaceRange(textToInsert, cursor);
		editor.setCursor({ line: cursor.line, ch: cursor.ch + 4 });
	}

	async updateNoteProperty(
		property: string,
		value: string,
		verbose = true,
		file?: TFile
	): Promise<void> {
		const targetFile = file || this.app.workspace.getActiveFile();
		if (!targetFile) {
			new Notice("No active file found.");
			return;
		}
		const valueBool = value === "true" || value === "false";
		const valueInput = valueBool
			? value === "true"
				? true
				: false
			: value;

		await this.frontMatterManager.updateProperty(
			targetFile,
			(frontmatter) => {
				frontmatter[property] = valueInput;
				return frontmatter;
			}
		);
		if (verbose) {
			new Notice(`Updated ${property} to ${value}`);
		}
	}

	async toggleStatus(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active file found.");
			return;
		}

		const currentStatus = await this.frontMatterManager.getProperty(activeFile, "status");
		let newStatus = "doing";
		if (currentStatus === "todo") {
			newStatus = "done";
		} else if (currentStatus === "done") {
			newStatus = "todo";
		}

		await this.updateNoteProperty("status", newStatus);

		if (newStatus === "todo") {
			await this.propagateStatusToAncestors(activeFile, "todo");
		} else if (newStatus === "done") {
			await this.propagateStatusToAncestors(activeFile, "done");
		}
	}

	async propagateStatusToAncestors(file: TFile, status: string): Promise<void> {
		const parent = await this.calculator.getParentFile(file);
		if (parent) {
			if (status === "todo") {
				await this.updateNoteProperty("status", "todo", false, parent);
				await this.propagateStatusToAncestors(parent, "todo");
			} else if (status === "done") {
				const childFiles = await this.calculator.getChildFiles(parent);
				const allChildrenDone = await Promise.all(
					childFiles.map(async (child) => {
						const childStatus = await this.frontMatterManager.getProperty(child, "status");
						return childStatus === "done";
					})
				);
				if (allChildrenDone.every((done) => done)) {
					await this.updateNoteProperty("status", "done", false, parent);
					await this.propagateStatusToAncestors(parent, "done");
				}
			}
		}
	}

	async propagatePriorityToDescendants(file: TFile, priority: string): Promise<void> {
		const childFiles = await this.calculator.getChildFiles(file);
		for (const child of childFiles) {
			await this.updateNoteProperty("priority", priority, false, child);
			await this.propagatePriorityToDescendants(child, priority);
		}
	}

	async openDoingNote(): Promise<void> {
		const rootPath = this.settings.rootNotePath;
		if (!rootPath) {
			new Notice(
				"Root note path is not configured in Time Tree settings."
			);
			return;
		}

		const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
		if (!rootFile || !(rootFile instanceof TFile)) {
			new Notice(`Root note ${rootPath} not found.`);
			return;
		}

		const doingNote = await this.frontMatterManager.findDoingNote(
			rootFile
		);
		if (doingNote) {
			this.app.workspace.getLeaf().openFile(doingNote);
		} else {
			new Notice("No running tracker found.");
		}
	}
}
