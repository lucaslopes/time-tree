export const defaultSettings: TimeTreeSettings = {
	onlyFirstTracker: true,
	rootNotePath: "",
	RootFolderPath: "/",
	considerSubdirs: true,
	computeIntervalMinutes: 0, // 0 means disabled by default
};

export interface TimeTreeSettings {
	onlyFirstTracker: boolean;
	rootNotePath: string;
	RootFolderPath: string;
	considerSubdirs: boolean;
	computeIntervalMinutes: number;
}
