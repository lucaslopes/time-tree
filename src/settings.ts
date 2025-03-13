export const defaultSettings: TimeTreeSettings = {
	onlyFirstTracker: false,
	rootNotePath: "",
	RootFolderPath: "/",
	considerSubdirs: false,
	computeIntervalMinutes: 0, // New property: 0 means disabled by default
};

export interface TimeTreeSettings {
	onlyFirstTracker: boolean;
	rootNotePath: string;
	RootFolderPath: string;
	considerSubdirs: boolean;
	computeIntervalMinutes: number; // New property
}
