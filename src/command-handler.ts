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
