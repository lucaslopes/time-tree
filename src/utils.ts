import { App, Setting, TFile, TFolder, normalizePath } from "obsidian";

export function formatFileLink(activeFile: TFile): string {
    return `[[${activeFile.path}|${activeFile.basename}]]`;
}

export async function gatherDescendantFiles(
    file: TFile,
    app: App,
    visited: Set<string> = new Set()
): Promise<TFile[]> {
    const files: TFile[] = [];
    if (visited.has(file.path)) {
        return files;
    }
    visited.add(file.path);
    const fileCache = app.metadataCache.getFileCache(file);
    if (fileCache && fileCache.links && fileCache.links.length > 0) {
        const ignoredLinks = fileCache.frontmatter?.running || [];
        for (const link of fileCache.links) {
            if (ignoredLinks.includes(link.link)) continue;
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

export function formatDateToISO(date: Date): string {
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return `${utcDate.getFullYear()}-${(utcDate.getMonth() + 1).toString().padStart(2, "0")}-${utcDate.getDate().toString().padStart(2, "0")}T${utcDate.getHours().toString().padStart(2, "0")}:${utcDate.getMinutes().toString().padStart(2, "0")}:${utcDate.getSeconds().toString().padStart(2, "0")}.${utcDate.getMilliseconds().toString().padStart(3, "0")}Z`;
}

export function formatISOToString(isoString: string): string {
    const localDate = new Date(isoString);
    return `${localDate.getFullYear()}-${(localDate.getMonth() + 1).toString().padStart(2, "0")}-${localDate.getDate().toString().padStart(2, "0")} ${localDate.getHours().toString().padStart(2, "0")}_${localDate.getMinutes().toString().padStart(2, "0")}_${localDate.getSeconds().toString().padStart(2, "0")}`;
}

export async function replaceSimpleTimeTrackerBlock(app: App, rootNote: TFile, name = "", startTime = ""): Promise<void> {
	// TODO: This function may be called multiple times when plugin is reloaded.
	// We only need the most recent file created in the folder.
	if (startTime === "") {
		startTime = formatDateToISO(new Date());
    }

    name = name ? name : formatFileLink(rootNote);
    if (rootNote && rootNote instanceof TFile) {
        const fileContent = await app.vault.read(rootNote);
        const updatedContent = fileContent.replace(
            /```simple-time-tracker[\s\S]*?```/g,
            `\`\`\`simple-time-tracker\n{"entries":[{"name":"${name}","startTime":"${startTime}","endTime":null}]}\n\`\`\``
        );
        await app.vault.modify(rootNote, updatedContent);
    }
}

function traverse(folder: TFolder, allFolders: TFolder[]) {
    allFolders.push(folder);
    if (folder.children) {
        folder.children.forEach((child) => {
            if (child instanceof TFolder) {
                traverse(child, allFolders);
            }
        });
    }
}

export function createPathSetting(
    app: App,
    containerEl: HTMLElement,
    name: string,
    description: string,
    value: string,
    onChange: (value: string) => Promise<void>,
    isFilePath = false
): void {
    new Setting(containerEl)
        .setName(name)
        .setDesc(description)
        .addText((text) => {
            text.setPlaceholder(`Enter ${isFilePath ? 'file' : 'folder'} path`)
                .setValue(value)
                .onChange(async (newValue) => {
                    await onChange(newValue);
                });

            const dataList = containerEl.createEl("datalist", {
                attr: { id: `${name.toLowerCase().replace(/ /g, "-")}-datalist` },
            });

            if (isFilePath) {
                const files = app.vault.getFiles();
                files.forEach((file) => {
                    dataList.createEl("option", {
                        attr: { value: file.path },
                    });
                });
            } else {
                const rootFolder = app.vault.getRoot();
                const allFolders: TFolder[] = [];

                traverse(rootFolder, allFolders);

                Array.from(allFolders.map((f) => f.path))
                    .sort()
                    .forEach((folderPath) => {
                        dataList.createEl("option", {
                            attr: { value: folderPath },
                        });
                    });
            }

            text.inputEl.setAttr("list", `${name.toLowerCase().replace(/ /g, "-")}-datalist`);
        });
}

export function getCorrectFilePath(timeFolderPath: string, fileName: string): string | null {
    const match = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
        return null;
    }

    const [, year, month, day] = match;
    return `${timeFolderPath}/${year}/${year}-${month}/${year}-${month}-${day}/${fileName}`;
}

export async function organizeSingleFile(app: App, timeFolderPath: string, file: TFile): Promise<void> {
    const correctFilePath = getCorrectFilePath(timeFolderPath, file.name);
    if (!correctFilePath) {
        // console.warn(`File ${file.path} does not have a valid date format in its name.`);
        return;
    }

    if (file.path === correctFilePath) {
        // File is already in the correct folder
        return;
    }

    // Ensure the correct folder structure exists
    const correctFolderPath = correctFilePath.substring(0, correctFilePath.lastIndexOf('/'));
    const folder = app.vault.getAbstractFileByPath(normalizePath(correctFolderPath));
    if (!folder) {
        await app.vault.createFolder(normalizePath(correctFolderPath));
    }

    // Move the file to the correct folder
    await app.vault.rename(file, normalizePath(correctFilePath));
}

export async function organizeTimeFolderFiles(app: App, timeFolderPath: string): Promise<void> {
    const timeFolder = app.vault.getAbstractFileByPath(normalizePath(timeFolderPath));

    if (!(timeFolder instanceof TFolder)) {
        console.error(`The path ${timeFolderPath} is not a folder.`);
        return;
    }

    const files = app.vault.getFiles().filter(file => file.path.startsWith(timeFolderPath));

    for (const file of files) {
        await organizeSingleFile(app, timeFolderPath, file);
    }
}

export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
