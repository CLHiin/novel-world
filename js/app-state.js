export function createEmptyState() {
    return {
        completedChapterIds: [],
        lastRead: null
    };
}

export const appState = {
    globalConfig: null,
    currentNovelKey: null,
    currentNovelData: null,
    novelConfig: null,
    currentUISize: "medium",
    savedState: createEmptyState(),
    currentArc: null,
    readerSession: null,
    libraryMode: "",
    libraryItems: [],
    libraryCache: new Map()
};
