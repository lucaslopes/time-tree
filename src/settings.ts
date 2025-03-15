export const defaultSettings: TimeTreeSettings = {
	rootNotePath: "",
	RootFolderPath: "/",
	computeIntervalMinutes: 0, // 0 means disabled by default
};

export interface TimeTreeSettings {
	rootNotePath: string;
	RootFolderPath: string;
	computeIntervalMinutes: number;
}
