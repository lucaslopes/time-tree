export const defaultSettings: TimeTreeSettings = {
    onlyFirstTracker: false,
    rootNotePath: ""
};

export interface TimeTreeSettings {
    onlyFirstTracker: boolean;
    rootNotePath: string;
}
