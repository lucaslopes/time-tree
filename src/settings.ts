export const defaultSettings: TimeTreeSettings = {
    onlyFirstTracker: false,
    rootNotePath: "",
    childNotesFolderPath: "/",
    recursiveChildNotes: false
};

export interface TimeTreeSettings {
    onlyFirstTracker: boolean;
    rootNotePath: string;
    childNotesFolderPath: string;
    recursiveChildNotes: boolean;
}
