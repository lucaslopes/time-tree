export const defaultSettings: TimeTreeSettings = {
	TimeFolderPath: "Time",
	TreeFolderPath: "Tree",
	rootNotePath: "Tree/root.md",
	computeIntervalMinutes: 0, // 0 means disabled by default
};

export interface TimeTreeSettings {
	TimeFolderPath: string;
	TreeFolderPath: string;
	rootNotePath: string;
	computeIntervalMinutes: number;
}
