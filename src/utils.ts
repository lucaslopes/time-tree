import { App, Setting, TFile, TFolder } from "obsidian";

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
        console.log("gatherDescendantFiles", ignoredLinks);
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

export async function replaceSimpleTimeTrackerBlock(app: App, rootNote: TFile, name = "", startTime = "2025-03-29T04:10:12.871Z"): Promise<void> {
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
