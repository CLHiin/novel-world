import { fetchText } from "./lazy-loader.js?v=20261002-27";
import { createEmptyState } from "./app-state.js";

const SAVE_KEY_PREFIX = "novel-reader-v1:";
const BOOKMARKS_KEY = "novel-reader-bookmarks-v1";

export async function fetchJson(url, description) {
    const text = await fetchText(url);

    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`${description}格式錯誤：${error.message}`);
    }
}

export function resolvePath(parentPath, relativePath) {
    return new URL(relativePath, new URL(parentPath, document.baseURI)).href;
}

export function readSavedState(novelId) {
    const raw = localStorage.getItem(`${SAVE_KEY_PREFIX}${novelId}`);
    if (!raw) return createEmptyState();

    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.completedChapterIds)) {
        throw new Error("本機閱讀紀錄格式錯誤，請清除該小說的閱讀紀錄後再試。");
    }

    return {
        completedChapterIds: data.completedChapterIds.map(String),
        lastRead: data.lastRead && typeof data.lastRead === "object"
            ? data.lastRead
            : null
    };
}

export function writeSavedState(novelId, savedState) {
    localStorage.setItem(
        `${SAVE_KEY_PREFIX}${novelId}`,
        JSON.stringify(savedState)
    );
}

export function readBookmarks() {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (!raw) return [];

    let bookmarks;
    try {
        bookmarks = JSON.parse(raw);
    } catch (error) {
        throw new Error(`本機閱讀書籤格式錯誤：${error.message}`);
    }
    if (!Array.isArray(bookmarks) || bookmarks.some(bookmark =>
        !bookmark
        || typeof bookmark.novelKey !== "string"
        || typeof bookmark.novelId !== "string"
        || typeof bookmark.arcId !== "string"
        || typeof bookmark.chapterId !== "string"
        || (bookmark.scrollTop !== undefined
            && (!Number.isFinite(bookmark.scrollTop) || bookmark.scrollTop < 0))
        || (bookmark.scrollRatio !== undefined
            && (!Number.isFinite(bookmark.scrollRatio) || bookmark.scrollRatio < 0 || bookmark.scrollRatio > 1))
        || (bookmark.progressRatio !== undefined
            && (!Number.isFinite(bookmark.progressRatio)
                || bookmark.progressRatio < 0
                || bookmark.progressRatio > 1))
    )) {
        throw new Error("本機閱讀書籤格式錯誤，請清除閱讀書籤後再試。");
    }
    return bookmarks;
}

export function writeBookmarks(bookmarks) {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}
