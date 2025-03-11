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
	 * Iterates over the list of required plugin IDs, collects their status,
	 * and if any plugin is not fully enabled, creates/updates a log note in the Logs folder.
	 */
	private async step1_checkDependency() {
		const requiredDependencies = [
			"simple-time-tracker",
			"dataview",
			"custom-node-size",
		];
		const allDependencies: Array<{
			pluginId: string;
			manifest: any;
			isEnabled: boolean;
		}> = [];
		for (const pluginId of requiredDependencies) {
			const appAny = this.app as any;
			const manifest = appAny.manifests?.[pluginId];
			const isEnabled = !!appAny.plugins?.plugins?.[pluginId];
			allDependencies.push({ pluginId, manifest, isEnabled });
		}
		// Check if any dependency is not fully enabled (missing manifest or not enabled)
		const missing = allDependencies.filter(
			(dep) => !dep.manifest || !dep.isEnabled
		);
		if (missing.length > 0) {
			console.warn(
				"Some plugins are required for full functionality. Check Logs/plugins.md for details."
			);
			await this.createMissingDependencyNote(allDependencies);
		}
	}

	/**
	 * Creates or updates a markdown note in the Logs folder that details the status of required plugins.
	 * The note title is "plugins.md".
	 * The note is divided into three sections: Not installed, Installed but not enabled, and Enabled.
	 * Uses the vault "create" event to detect when the file is (re)created.
	 * @param deps - Array of dependency objects for all required plugins.
	 */
	private async createMissingDependencyNote(
		deps: Array<{ pluginId: string; manifest: any; isEnabled: boolean }>
	) {
		const filePath = "Logs/plugins.md";
		let noteContent =
			"# Required Plugins\n\n" +
			"The following plugins are required for full functionality of the Time Tree plugin. " +
			"Please install the ones that are missing, and enable the ones that are disabled.\n\n";

		const notInstalled = deps.filter((dep) => !dep.manifest);
		const installedDisabled = deps.filter(
			(dep) => dep.manifest && !dep.isEnabled
		);
		const enabled = deps.filter((dep) => dep.manifest && dep.isEnabled);

		if (notInstalled.length > 0) {
			noteContent += "## 🔴 Not installed\n\n";
			for (const dep of notInstalled) {
				noteContent += `- **${dep.pluginId}**: [Install/Enable](obsidian://show-plugin?id=${dep.pluginId})\n`;
			}
			noteContent += "\n";
		}

		if (installedDisabled.length > 0) {
			noteContent += "## 🟡 Installed but not enabled\n\n";
			for (const dep of installedDisabled) {
				noteContent += `- **${dep.pluginId}**: [Install/Enable](obsidian://show-plugin?id=${dep.pluginId})\n`;
			}
			noteContent += "\n";
		}

		if (enabled.length > 0) {
			noteContent += "## ✅ Enabled\n\n";
			for (const dep of enabled) {
				noteContent += `- **${dep.pluginId}**: [Install/Enable](obsidian://show-plugin?id=${dep.pluginId})\n`;
			}
			noteContent += "\n";
		}

		try {
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			if (existingFile && existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, noteContent);
			} else {
				await this.app.vault.create(filePath, noteContent);
			}
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
