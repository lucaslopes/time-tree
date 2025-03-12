export const defaultSettings: TimeTreeSettings = {
	onlyFirstTracker: false,
	rootNotePath: "",
	RootFolderPath: "/",
	considerSubdirs: false,
};

export interface TimeTreeSettings {
	onlyFirstTracker: boolean;
	rootNotePath: string;
	RootFolderPath: string;
	considerSubdirs: boolean;
}
