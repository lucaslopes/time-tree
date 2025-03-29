export const defaultSettings: TimeTreeSettings = {
	rootNotePath: "",
	RootFolderPath: "/",
	targetFolderPath: "/",
	computeIntervalMinutes: 0, // 0 means disabled by default
};

export interface TimeTreeSettings {
	rootNotePath: string;
	RootFolderPath: string;
	targetFolderPath: string;
	computeIntervalMinutes: number;
}
