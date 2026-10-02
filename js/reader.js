import { appState } from "./app-state.js";
import { fetchText, preload } from "./lazy-loader.js?v=20261002-27";
import {
    readBookmarks,
    resolvePath,
    writeBookmarks,
    writeSavedState
} from "./data-store.js?v=20261002-27";
import { setBreadcrumbs, switchScreen } from "./navigation.js?v=20261002-27";

let navigationHandlers = {};
let onProgressSaved = () => {};
let onError = error => console.error(error);
let scrollSaveTimer = null;
let scrollListenerAttached = false;

export function configureReader(handlers) {
    navigationHandlers = handlers.navigation;
    onProgressSaved = handlers.onProgressSaved || onProgressSaved;
    onError = handlers.onError || onError;

    if (!scrollListenerAttached) {
        document.getElementById("dialogue-text").addEventListener("scroll", handleReaderScroll);
        document.getElementById("reader-bookmark").addEventListener("click", toggleChapterBookmark);
        scrollListenerAttached = true;
    }
}

export async function openStoryChapter(chapter) {
    try {
        if (!flushReaderProgress()) return;
        const arc = appState.currentArc;
        if (!arc) throw new Error("尚未選擇篇章。");

        const url = resolvePath(arc.indexUrl, chapter.file);
        const markdown = await fetchText(url);
        const chapterIndex = arc.chapters.findIndex(item => item.id === chapter.id);
        if (chapterIndex < 0) throw new Error(`篇章索引中找不到章節：${chapter.id}`);

        const saved = appState.savedState.lastRead;
        const savedPosition = saved?.arcId === arc.id && saved?.chapterId === chapter.id
            ? saved
            : null;
        appState.readerSession = {
            arc,
            chapter,
            chapterIndex,
            contentHtml: markdownToHtml(markdown),
            scrollTop: Math.max(0, Number(savedPosition?.scrollTop) || 0),
            legacyScrollRatio: Number(savedPosition?.scrollRatio) || 0,
            completed: appState.savedState.completedChapterIds.includes(String(chapter.id))
        };
        appState.savedState.lastRead = {
            arcId: arc.id,
            chapterId: chapter.id,
            scrollTop: appState.readerSession.scrollTop
        };
        saveProgress();

        const background = document.getElementById("bg-image");
        if (chapter.background) {
            background.hidden = false;
            background.src = resolvePath(arc.indexUrl, chapter.background);
        } else {
            background.hidden = true;
            background.removeAttribute("src");
        }

        setBreadcrumbs([
            {
                label: appState.currentNovelData.title,
                activate: navigationHandlers.openNovelHome
            },
            {
                label: "小說章節",
                activate: navigationHandlers.openChapterList
            },
            {
                label: arc.title || arc.name,
                activate: () => navigationHandlers.openArc(arc)
            },
            { label: chapter.title || chapter.id }
        ]);
        switchScreen("screen-reader");
        renderReader();

        requestAnimationFrame(() => {
            const content = document.getElementById("dialogue-text");
            const session = appState.readerSession;
            if (!session) return;
            content.scrollTop = session.scrollTop || session.legacyScrollRatio
                * Math.max(content.scrollHeight - content.clientHeight, 0);
            session.scrollTop = content.scrollTop;
            session.legacyScrollRatio = 0;
            persistScrollProgress(session);
            updateProgressLabel();
        });

        const nextChapter = arc.chapters[chapterIndex + 1];
        if (nextChapter?.file) preload(resolvePath(arc.indexUrl, nextChapter.file));
    } catch (error) {
        onError(error);
    }
}

function markdownToHtml(markdown) {
    const content = markdown
        .replace(/^\uFEFF/, "")
        .replace(/^#[^\r\n]*(?:\r?\n|$)/, "");

    return content
        .split(/\r?\n\s*\r?\n+/)
        .map(block => block.trim())
        .filter(Boolean)
        .map(block => {
            const heading = block.match(/^(#{2,6})\s+(.+)$/);
            if (heading) {
                const level = heading[1].length;
                return `<h${level}>${formatInline(heading[2])}</h${level}>`;
            }
            if (/^---+$/.test(block)) return "<hr>";
            return `<p>${formatInline(block).replace(/\r?\n/g, "<br>")}</p>`;
        })
        .join("\n");
}

function formatInline(value) {
    return escapeHtml(value)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function renderReader() {
    const session = appState.readerSession;
    if (!session) return;

    const heading = document.getElementById("reader-heading");
    const content = document.getElementById("dialogue-text");
    const completion = document.getElementById("reader-completion");
    const progress = document.getElementById("reader-progress");
    const previous = document.getElementById("reader-prev");
    const next = document.getElementById("reader-next");

    heading.textContent = `${session.arc.title || session.arc.name}　／　${session.chapter.title || session.chapter.id}`;
    content.innerHTML = session.contentHtml || "<p>（本章尚無正文）</p>";
    content.scrollTop = session.scrollTop || 0;
    completion.hidden = !session.completed;
    completion.textContent = "本章已完成，相關資料的解鎖狀態已更新。";
    previous.disabled = session.chapterIndex <= 0;
    const hasNextChapter = session.chapterIndex < session.arc.chapters.length - 1;
    const arcs = appState.novelConfig.story?.arcs || [];
    const currentArcIndex = arcs.findIndex(arc => arc.id === session.arc.id);
    const hasNextArc = currentArcIndex >= 0 && currentArcIndex < arcs.length - 1;
    next.textContent = session.completed
        ? hasNextChapter ? "閱讀下一章" : hasNextArc ? "閱讀下一篇章" : "本章已完成"
        : "完成本章";
    next.disabled = session.completed && !hasNextChapter && !hasNextArc;
    updateChapterBookmarkButton();
    updateProgressLabel();
}

function updateChapterBookmarkButton() {
    const button = document.getElementById("reader-bookmark");
    const session = appState.readerSession;
    const isBookmarked = session && readBookmarks().some(bookmark =>
        bookmark.novelId === String(appState.novelConfig.id)
        && bookmark.arcId === String(session.arc.id)
        && bookmark.chapterId === String(session.chapter.id)
    );
    button.setAttribute("aria-pressed", String(Boolean(isBookmarked)));
    button.textContent = isBookmarked ? "★ 移除書籤" : "☆ 加入書籤";
}

function toggleChapterBookmark() {
    const session = appState.readerSession;
    if (!session || !appState.novelConfig || !appState.currentNovelData) return;

    try {
        const target = {
            novelKey: appState.currentNovelKey,
            novelId: String(appState.novelConfig.id),
            novelTitle: appState.currentNovelData.title || appState.currentNovelKey,
            arcId: String(session.arc.id),
            arcTitle: session.arc.title || session.arc.name || String(session.arc.id),
            chapterId: String(session.chapter.id),
            chapterTitle: session.chapter.title || String(session.chapter.id),
            scrollTop: getCurrentScrollTop(),
            progressRatio: getCurrentProgressRatio(),
            updatedAt: Date.now()
        };
        const bookmarks = readBookmarks();
        const existingIndex = bookmarks.findIndex(bookmark =>
            bookmark.novelId === target.novelId
            && bookmark.arcId === target.arcId
            && bookmark.chapterId === target.chapterId
        );

        if (existingIndex >= 0) {
            bookmarks.splice(existingIndex, 1);
        } else {
            bookmarks.push(target);
        }
        writeBookmarks(bookmarks);
        updateChapterBookmarkButton();
    } catch (error) {
        onError(error);
    }
}

function getCurrentScrollTop() {
    const content = document.getElementById("dialogue-text");
    return content.scrollTop;
}

function getCurrentProgressRatio() {
    const content = document.getElementById("dialogue-text");
    const maximum = Math.max(content.scrollHeight - content.clientHeight, 0);
    return maximum ? clamp(content.scrollTop / maximum, 0, 1) : 1;
}

function updateProgressLabel() {
    const percentage = Math.round(getCurrentProgressRatio() * 100);
    document.getElementById("reader-progress").textContent = `閱讀進度 ${percentage}%`;
}

function handleReaderScroll() {
    const session = appState.readerSession;
    if (!session) return;

    updateProgressLabel();
    if (scrollSaveTimer) window.clearTimeout(scrollSaveTimer);
    scrollSaveTimer = window.setTimeout(() => {
        scrollSaveTimer = null;
        persistScrollProgress(session);
    }, 300);
}

export function flushReaderProgress() {
    if (scrollSaveTimer) {
        window.clearTimeout(scrollSaveTimer);
        scrollSaveTimer = null;
    }
    if (!document.body.classList.contains("reader-mode")) return true;

    const session = appState.readerSession;
    return !session || persistScrollProgress(session);
}

function persistScrollProgress(session) {
    try {
        const content = document.getElementById("dialogue-text");
        session.scrollTop = content.scrollTop;
        appState.savedState.lastRead = {
            arcId: session.arc.id,
            chapterId: session.chapter.id,
            scrollTop: session.scrollTop
        };
        saveProgress();
        syncCurrentBookmarkProgress(session, session.scrollTop, getCurrentProgressRatio());
        return true;
    } catch (error) {
        onError(error);
        return false;
    }
}

function syncCurrentBookmarkProgress(session, scrollTop, progressRatio) {
    const bookmarks = readBookmarks();
    const bookmark = bookmarks.find(item =>
        item.novelId === String(appState.novelConfig.id)
        && item.arcId === String(session.arc.id)
        && item.chapterId === String(session.chapter.id)
    );
    if (!bookmark) return;

    bookmark.scrollTop = scrollTop;
    bookmark.progressRatio = progressRatio;
    bookmark.updatedAt = Date.now();
    writeBookmarks(bookmarks);
}

function saveProgress() {
    writeSavedState(appState.novelConfig.id, appState.savedState);
    onProgressSaved();
}

export async function previousChapter() {
    const session = appState.readerSession;
    if (!session || session.chapterIndex <= 0) return;
    await openStoryChapter(session.arc.chapters[session.chapterIndex - 1]);
}

export async function completeOrNextChapter() {
    const session = appState.readerSession;
    if (!session) return;

    if (session.completed) {
        const nextChapter = session.arc.chapters[session.chapterIndex + 1];
        if (nextChapter) {
            await openStoryChapter(nextChapter);
        } else if (navigationHandlers.openNextArcChapter) {
            const advanced = await navigationHandlers.openNextArcChapter();
            if (!advanced) {
                const next = document.getElementById("reader-next");
                next.textContent = "本章已完成";
                next.disabled = true;
            }
        }
        return;
    }

    try {
        if (scrollSaveTimer) {
            window.clearTimeout(scrollSaveTimer);
            scrollSaveTimer = null;
        }
        if (!persistScrollProgress(session)) return;

        const chapterId = String(session.chapter.id);
        if (!appState.savedState.completedChapterIds.includes(chapterId)) {
            appState.savedState.completedChapterIds.push(chapterId);
        }

        const nextChapter = session.arc.chapters[session.chapterIndex + 1];
        appState.savedState.lastRead = {
            arcId: session.arc.id,
            chapterId: nextChapter?.id || session.chapter.id,
            scrollTop: nextChapter ? 0 : getCurrentScrollTop()
        };
        session.completed = true;
        saveProgress();
        renderReader();
    } catch (error) {
        onError(error);
    }
}

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}
