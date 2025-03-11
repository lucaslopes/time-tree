import { Plugin, Notice, TFile } from "obsidian";

export default class TimeTree extends Plugin {
	async onload() {
		// Execute the steps in sequence for clarity
		await this.step0_ensureFolders();
		await this.step1_checkDependency();
	}

	/**
	 * STEP 0: Ensure that the required folders exist (Templates, Tasks, Logs).
	 */
	private async step0_ensureFolders() {
		await this.ensureFolderExists("Templates");
		await this.ensureFolderExists("Tasks");
		await this.ensureFolderExists("Logs");
	}

	/**
	 * Helper function to ensure a folder with the given name exists in the vault.
	 * If it doesn't exist, the folder is created.
	 * @param folderName - The name of the folder to ensure existence
	 */
	private async ensureFolderExists(folderName: string) {
		const folder = this.app.vault.getAbstractFileByPath(folderName);
		if (!folder) {
			try {
				await this.app.vault.createFolder(folderName);
			} catch (e: any) {
				if (!e.message.includes("already exists")) {
					console.error(`Error creating ${folderName} folder:`, e);
				}
			}
		}
	}

	/**
	 * STEP 1: Check for the required dependencies.
	 * Checks if each plugin in the list is missing or disabled.
	 * If one or more are missing, creates/updates a log note in the Logs folder with details.
	 */
	private async step1_checkDependency() {
		const requiredDependencies = [
			"obsidian-simple-time-tracker",
			"dataview",
		];
		let missingDependencies: Array<{
			pluginId: string;
			manifest: any;
			isEnabled: boolean;
		}> = [];
		for (const pluginId of requiredDependencies) {
			const appAny = this.app as any;
			const manifest = appAny.manifests?.[pluginId];
			const isEnabled = !!appAny.plugins?.plugins?.[pluginId];
			if (!manifest || !isEnabled) {
				missingDependencies.push({ pluginId, manifest, isEnabled });
			}
		}
		if (missingDependencies.length > 0) {
			console.warn(
				"Some plugins are required for full functionality. Check Logs/plugins.md for details."
			);
			await this.createMissingDependencyNote(missingDependencies);
		}
	}

	/**
	 * Creates or updates a markdown note in the Logs folder that details the missing dependencies.
	 * The note title is "plugins.md".
	 * @param missingDeps - Array of missing dependency objects.
	 */
	private async createMissingDependencyNote(
		missingDeps: Array<{
			pluginId: string;
			manifest: any;
			isEnabled: boolean;
		}>
	) {
		const filePath = "Logs/plugins.md";
		let noteContent =
			"# Missing Dependencies\n\nThe following plugins are required for full functionality of the Time Tree plugin:\n\n";
		for (const dep of missingDeps) {
			let statusEmoji = "";
			let statusText = "";
			if (!dep.manifest) {
				statusEmoji = "🔴"; // Not installed
				statusText = "Not installed";
			} else if (!dep.isEnabled) {
				statusEmoji = "🟡"; // Installed but disabled
				statusText = "Installed but not enabled";
			} else {
				statusEmoji = "✅";
				statusText = "Enabled";
			}
			noteContent += `- **${dep.pluginId}**: ${statusEmoji} ${statusText}\n  - [Install/Enable](obsidian://show-plugin?id=${dep.pluginId})\n\n`;
		}
		noteContent +=
			"Please install and/or enable the missing plugins. Once resolved, this warning will not appear.\n";

		try {
			// If the file already exists, delete it
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			if (existingFile && existingFile instanceof TFile) {
				await this.app.vault.delete(existingFile);
			}
			// Create a new file with the note content
			await this.app.vault.create(filePath, noteContent);
		} catch (e: any) {
			if (!e.message.includes("already exists")) {
				console.error("Error creating missing plugins note", e);
			}
		}
	}

	onunload() {
		// Cleanup if necessary
	}
}
