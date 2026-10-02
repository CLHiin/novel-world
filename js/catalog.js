import { appState } from "./app-state.js";
import {
    fetchJson,
    readBookmarks,
    readSavedState,
    resolvePath,
    writeBookmarks
} from "./data-store.js?v=20261002-27";
import { setBreadcrumbs, switchScreen } from "./navigation.js?v=20261002-27";
import { flushReaderProgress, openStoryChapter } from "./reader.js?v=20261002-27";
import { preload } from "./lazy-loader.js?v=20261002-27";

const LIBRARY_TYPES = ["characters", "world", "maps"];
const LAST_NOVEL_KEY = "novel-reader-last-novel";
let onError = error => console.error(error);
let detailRenderId = 0;

export function configureCatalog(handlers) {
    onError = handlers.onError || onError;
    document.getElementById("library-search").addEventListener("input", () => {
        const hadDetail = closeEntryDetail();
        renderLibraryCards();
        if (hadDetail) restoreLibraryBreadcrumbs();
    });
    const preview = document.getElementById("image-preview");
    preview.querySelector(".image-preview-close").addEventListener("click", () => preview.close());
    preview.addEventListener("click", event => {
        if (event.target === preview) preview.close();
    });
}

export async function initializeCatalog() {
    try {
        appState.globalConfig = await fetchJson("素材/web.json", "全域素材索引");
        setHomeBackground();
        renderNovelWall();
        const lastNovelKey = localStorage.getItem(LAST_NOVEL_KEY);
        if (lastNovelKey && appState.globalConfig.novels?.[lastNovelKey]) {
            await selectNovel(lastNovelKey);
        }
    } catch (error) {
        console.error("無法載入全域素材索引 web.json：", error);
        document.getElementById("novel-wall").textContent =
            "首頁資料載入失敗，請確認素材/web.json 是否存在且格式正確。";
    }
}

function setHomeBackground() {
    const general = appState.globalConfig?.general || {};
    const image = document.getElementById("home-bg");
    image.onerror = () => {
        image.onerror = null;
        image.src = general.Background_default || "";
    };
    image.src = general.Background_home || general.Background_default || "";
}

function renderNovelWall() {
    const wall = document.getElementById("novel-wall");
    wall.replaceChildren();
    wall.classList.add("grid-3");

    Object.entries(appState.globalConfig?.novels || {})
        .filter(([, novel]) => novel?.title)
        .forEach(([key, novel]) => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "novel-card";
            card.setAttribute("aria-label", `進入${novel.title}`);

            const image = document.createElement("img");
            image.src = getNovelCover(novel);
            image.alt = `${novel.title}封面`;
            image.onerror = () => {
                image.onerror = null;
                image.src = appState.globalConfig?.general?.Cover_default
                    || appState.globalConfig?.general?.Cover_defalut
                    || "";
            };

            const heading = document.createElement("h3");
            heading.textContent = novel.title;
            card.append(image, heading);
            card.addEventListener("click", () => selectNovel(key));
            wall.appendChild(card);
        });
}

function getNovelCover(novel) {
    const general = appState.globalConfig?.general || {};
    if (!novel.Background || !novel.configPath) {
        return general.Cover_teaser || general.Cover_default || "";
    }
    return novel.cover || general.Cover_default || general.Cover_defalut || "";
}

export async function selectNovel(key) {
    if (!flushReaderProgress()) return;
    appState.currentNovelKey = key;
    appState.currentNovelData = appState.globalConfig?.novels?.[key];
    appState.novelConfig = null;
    appState.currentArc = null;
    appState.libraryCache = new Map();

    if (!appState.currentNovelData) {
        onError(new Error("找不到這個小說世界。"));
        return;
    }
    localStorage.setItem(LAST_NOVEL_KEY, key);

    document.getElementById("current-novel-title").textContent =
        appState.currentNovelData.title || "未命名小說";
    document.getElementById("current-novel-description").textContent = "";
    setNovelBackground();

    try {
        if (appState.currentNovelData.configPath) {
            const configUrl = new URL(appState.currentNovelData.configPath, document.baseURI).href;
            appState.novelConfig = await fetchJson(configUrl, "小說架構檔");
            if (!appState.novelConfig.id) throw new Error("小說架構檔缺少唯一 id。");
            appState.savedState = readSavedState(appState.novelConfig.id);
            document.getElementById("current-novel-description").textContent =
                appState.novelConfig.description || "";
        } else {
            appState.savedState = { completedChapterIds: [], lastRead: null };
        }

        updateResumeButton();
        setBreadcrumbs([{ label: appState.currentNovelData.title, activate: openNovelHome }]);
        closeSideMenu();
        switchScreen("screen-novel-home");
    } catch (error) {
        onError(error);
    }
}

export function openHome() {
    if (!flushReaderProgress()) return;
    appState.currentNovelKey = null;
    appState.currentNovelData = null;
    appState.novelConfig = null;
    appState.currentArc = null;
    localStorage.removeItem(LAST_NOVEL_KEY);
    setBreadcrumbs([]);
    closeSideMenu();
    switchScreen("screen-home");
}

export function openNovelHome() {
    if (!appState.currentNovelData) return;
    if (!flushReaderProgress()) return;
    setNovelBackground();
    setBreadcrumbs([
        { label: appState.currentNovelData.title, activate: openNovelHome }
    ]);
    closeSideMenu();
    switchScreen("screen-novel-home");
}

function setNovelBackground() {
    const general = appState.globalConfig?.general || {};
    const image = document.getElementById("novel-bg");
    image.onerror = () => {
        image.onerror = null;
        image.src = general.Background_default || "";
    };
    image.src = appState.currentNovelData?.Background || general.Background_default || "";
}

export function toggleSideMenu() {
    document.getElementById("side-menu").classList.toggle("open");
}

function closeSideMenu() {
    document.getElementById("side-menu").classList.remove("open");
}

export async function loadNovelConfig() {
    if (appState.novelConfig) return appState.novelConfig;
    if (!appState.currentNovelData?.configPath) {
        throw new Error(appState.currentNovelData
            ? "這個小說世界尚未建立架構檔。"
            : "請先從首頁選擇一個小說世界，再開啟章節或圖鑑。");
    }

    const configUrl = new URL(appState.currentNovelData.configPath, document.baseURI).href;
    appState.novelConfig = await fetchJson(configUrl, "小說架構檔");
    if (!appState.novelConfig.id) throw new Error("小說架構檔缺少唯一 id。");
    appState.savedState = readSavedState(appState.novelConfig.id);
    return appState.novelConfig;
}

function setLibraryPage(title, description = "") {
    closeEntryDetail();
    appState.libraryItems = [];
    appState.libraryMode = "";

    const image = document.getElementById("library-bg");
    image.src = appState.currentNovelData?.Background
        || appState.globalConfig?.general?.Background_default
        || "";
    document.getElementById("library-title").textContent = title;
    document.getElementById("library-description").textContent = description;
    document.getElementById("library-search").value = "";
    document.getElementById("library-search").hidden = true;
    const list = document.getElementById("library-list");
    list.replaceChildren();
    list.classList.remove("bookmarks-list");
    list.hidden = false;
    switchScreen("screen-library");
}

function setNovelBreadcrumb(label, activate) {
    return [
        { label: appState.currentNovelData.title, activate: openNovelHome },
        { label, activate }
    ];
}

export async function openChapterList() {
    if (!flushReaderProgress()) return;
    try {
        await loadNovelConfig();
        const arcs = appState.novelConfig.story?.arcs || [];
        const description = appState.novelConfig.story?.description
            || "選擇篇章以查看其中的章節。";
        setLibraryPage("小說章節", description);
        appState.libraryMode = "arcs";
        appState.libraryItems = arcs;
        document.getElementById("library-search").hidden = false;
        setBreadcrumbs(setNovelBreadcrumb("小說章節", openChapterList));
        renderLibraryCards();
        closeSideMenu();
    } catch (error) {
        onError(error);
    }
}

export async function openArc(arc) {
    if (!flushReaderProgress()) return;
    try {
        const configUrl = new URL(appState.currentNovelData.configPath, document.baseURI).href;
        const indexUrl = resolvePath(configUrl, arc.index);
        const index = await fetchJson(indexUrl, `篇章「${arc.title || arc.name}」索引`);
        const chapters = Array.isArray(index.chapters) ? index.chapters : [];
        appState.currentArc = { ...arc, indexUrl, chapters };
        setLibraryPage(
            index.title || arc.title || arc.name || "章節列表",
            arc.description || index.description || ""
        );
        appState.libraryMode = "chapters";
        appState.libraryItems = chapters;
        document.getElementById("library-search").hidden = false;
        setBreadcrumbs([
            ...setNovelBreadcrumb("小說章節", openChapterList),
            { label: arc.title || arc.name, activate: () => openArc(arc) }
        ]);
        renderLibraryCards();

        if (chapters[0]?.file) preload(resolvePath(indexUrl, chapters[0].file));
    } catch (error) {
        onError(error);
    }
}

export async function openDataLibrary(type) {
    if (!flushReaderProgress()) return;
    try {
        await loadNovelConfig();
        const definition = appState.novelConfig.libraries?.[type];
        if (!definition?.index) {
            throw new Error(`小說架構檔尚未設定「${type}」資料索引。`);
        }

        const configUrl = new URL(appState.currentNovelData.configPath, document.baseURI).href;
        const indexUrl = resolvePath(configUrl, definition.index);
        const cacheKey = `${type}:${indexUrl}`;
        if (!appState.libraryCache.has(cacheKey)) {
            appState.libraryCache.set(
                cacheKey,
                fetchJson(indexUrl, `${definition.title || type}索引`)
            );
        }
        const index = await appState.libraryCache.get(cacheKey);
        setLibraryPage(definition.title || index.title || "資料圖鑑", index.description || "");
        appState.libraryMode = type;
        appState.libraryItems = Array.isArray(index.items) ? index.items : [];
        document.getElementById("library-search").hidden = false;
        setBreadcrumbs(setNovelBreadcrumb(definition.title || index.title || "資料圖鑑", () => openDataLibrary(type)));
        renderLibraryCards();
        closeSideMenu();
    } catch (error) {
        onError(error);
    }
}

function renderLibraryCards() {
    const list = document.getElementById("library-list");
    const query = document.getElementById("library-search").value.trim().toLocaleLowerCase();
    closeEntryDetail();
    list.replaceChildren();

    if (appState.libraryMode === "bookmarks") {
        renderBookmarks(list, query);
        return;
    }

    const filtered = appState.libraryItems.filter(item => {
        const searchable = [
            item.title,
            item.name,
            item.summary,
            ...(Array.isArray(item.tags) ? item.tags : [])
        ].join(" ").toLocaleLowerCase();
        return searchable.includes(query);
    });

    if (!filtered.length) {
        const empty = document.createElement("p");
        empty.className = "library-empty";
        empty.textContent = query ? "沒有符合搜尋條件的資料。" : "目前尚未建立資料。";
        list.appendChild(empty);
        return;
    }

    filtered.forEach(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "library-card";
        button.dataset.libraryEntryId = getLibraryEntryId(item);
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", "library-detail");
        const title = document.createElement("strong");
        title.textContent = item.title || item.name || item.chapterName || item.id || "未命名";
        const subtitle = document.createElement("small");
        subtitle.textContent = item.summary || item.description || "";
        const tooltip = item.description || item.summary;
        if (tooltip) button.title = tooltip;
        button.append(title, subtitle);
        button.addEventListener("click", () => openLibraryItem(item));
        list.appendChild(button);
    });
}

function openLibraryItem(item) {
    if (appState.libraryMode === "arcs") {
        openArc(item);
    } else if (appState.libraryMode === "chapters") {
        openStoryChapter(item);
    } else {
        const detail = document.getElementById("library-detail");
        const entryKey = `${appState.libraryMode}:${getLibraryEntryId(item)}`;
        if (!detail.hidden && detail.dataset.entryKey === entryKey) {
            closeEntryDetail();
            restoreLibraryBreadcrumbs();
            return;
        }
        showEntryDetail(item, appState.libraryMode);
    }
}

function getLibraryEntryId(item) {
    return String(item.id ?? item.name ?? item.title ?? "");
}

function closeEntryDetail() {
    const detail = document.getElementById("library-detail");
    if (!detail) return false;
    detailRenderId += 1;
    const wasOpen = !detail.hidden;
    detail.hidden = true;
    delete detail.dataset.entryKey;
    detail.replaceChildren();
    document.querySelectorAll("#library-list [aria-controls='library-detail']").forEach(button => {
        button.setAttribute("aria-expanded", "false");
    });
    const list = document.getElementById("library-list");
    if (list.parentElement && detail.parentElement !== list.parentElement) {
        list.after(detail);
    } else if (detail.parentElement === list) {
        list.after(detail);
    }
    return wasOpen;
}

function restoreLibraryBreadcrumbs() {
    if (!LIBRARY_TYPES.includes(appState.libraryMode)) return;
    const title = document.getElementById("library-title").textContent;
    const type = appState.libraryMode;
    setBreadcrumbs(setNovelBreadcrumb(title, () => openDataLibrary(type)));
}

function renderBookmarks(list, query) {
    const bookmarks = readBookmarks().filter(bookmark => [
        bookmark.novelTitle,
        bookmark.arcTitle,
        bookmark.chapterTitle
    ].join(" ").toLocaleLowerCase().includes(query));

    if (!bookmarks.length) {
        const empty = document.createElement("p");
        empty.className = "library-empty";
        empty.textContent = query
            ? "沒有符合搜尋條件的書籤。"
            : "尚未加入閱讀書籤。閱讀章節時可按「加入書籤」，之後便能從這裡跨小說、篇章跳轉。";
        list.appendChild(empty);
        return;
    }

    bookmarks
        .slice()
        .sort((first, second) => (second.updatedAt || 0) - (first.updatedAt || 0))
        .forEach(bookmark => {
            const card = document.createElement("article");
            card.className = "bookmark-entry";

            const open = document.createElement("button");
            open.type = "button";
            open.className = "bookmark-entry-open";
            open.innerHTML = `
                <strong>${escapeHtml(bookmark.chapterTitle || bookmark.chapterId)}</strong>
                <span>${escapeHtml(bookmark.novelTitle || bookmark.novelKey)}　／　${escapeHtml(bookmark.arcTitle || bookmark.arcId)}</span>
            `;
            const progressRatio = Number.isFinite(bookmark.progressRatio)
                ? bookmark.progressRatio
                : bookmark.scrollRatio;
            const progress = document.createElement("span");
            progress.className = "bookmark-progress";
            progress.textContent = Number.isFinite(progressRatio)
                ? `閱讀進度 ${Math.round(progressRatio * 100)}%`
                : "閱讀位置將於下次閱讀時同步";
            open.appendChild(progress);
            open.addEventListener("click", () => openSavedBookmark(bookmark));

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "bookmark-entry-remove";
            remove.textContent = "移除";
            remove.setAttribute("aria-label", `移除「${bookmark.chapterTitle || bookmark.chapterId}」書籤`);
            remove.addEventListener("click", () => {
                writeBookmarks(readBookmarks().filter(item => !isSameBookmark(item, bookmark)));
                list.replaceChildren();
                renderBookmarks(list, query);
            });

            card.append(open, remove);
            list.appendChild(card);
        });
}

async function openSavedBookmark(bookmark) {
    if (!flushReaderProgress()) return;

    try {
        const novel = appState.globalConfig?.novels?.[bookmark.novelKey];
        if (!novel) throw new Error(`找不到書籤所屬的小說世界：${bookmark.novelTitle || bookmark.novelKey}`);

        await selectNovel(bookmark.novelKey);
        const config = await loadNovelConfig();
        if (String(config.id) !== bookmark.novelId) {
            throw new Error(`書籤「${bookmark.chapterTitle || bookmark.chapterId}」所屬小說架構已變更。`);
        }

        const arc = (config.story?.arcs || []).find(item => String(item.id) === bookmark.arcId);
        if (!arc) throw new Error(`找不到書籤所屬篇章：${bookmark.arcTitle || bookmark.arcId}`);
        await openArc(arc);
        if (String(appState.currentArc?.id) !== bookmark.arcId) return;

        const chapter = appState.currentArc.chapters.find(
            item => String(item.id) === bookmark.chapterId
        );
        if (!chapter) throw new Error(`找不到書籤所屬章節：${bookmark.chapterTitle || bookmark.chapterId}`);
        appState.savedState.lastRead = {
            arcId: bookmark.arcId,
            chapterId: bookmark.chapterId,
            scrollTop: Math.max(0, Number(bookmark.scrollTop) || 0),
            scrollRatio: bookmark.scrollTop === undefined ? bookmark.scrollRatio : undefined
        };
        await openStoryChapter(chapter);
    } catch (error) {
        onError(error);
    }
}

function isSameBookmark(first, second) {
    return first.novelId === second.novelId
        && first.arcId === second.arcId
        && first.chapterId === second.chapterId;
}

function isEntryUnlocked(item) {
    const initialStatus = item.initialStatus || "open";
    if (initialStatus === "open" || initialStatus === "unlocked") return true;
    const unlockAfter = Array.isArray(item.unlockAfter) ? item.unlockAfter : [];
    return unlockAfter.some(id => appState.savedState.completedChapterIds.includes(String(id)));
}

async function showEntryDetail(item, type) {
    const detail = document.getElementById("library-detail");
    closeEntryDetail();
    const renderId = ++detailRenderId;
    const entryKey = `${type}:${getLibraryEntryId(item)}`;
    detail.dataset.entryKey = entryKey;
    detail.hidden = false;
    detail.textContent = "正在載入設定內容……";
    const list = document.getElementById("library-list");
    const card = [...list.querySelectorAll("[data-library-entry-id]")]
        .find(button => button.dataset.libraryEntryId === getLibraryEntryId(item));
    if (card) {
        card.setAttribute("aria-expanded", "true");
        list.insertBefore(detail, card.nextSibling);
    } else {
        list.after(detail);
    }

    try {
        const unlocked = isEntryUnlocked(item);
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const links = Array.isArray(item.links) ? item.links : [];
        const hasSections = Array.isArray(item.sections) && item.sections.length > 0;
        const summary = String(item.summary || "").trim();
        const detailText = stripSummaryPrefix(item.content || item.description || "", summary);
        const sections = hasSections
            ? item.sections
            : Array.isArray(item.unlockAfter) && item.unlockAfter.length && detailText.trim()
                ? [{
                    id: `${item.id || "entry"}-details`,
                    title: "詳細內容",
                    content: detailText,
                    initialStatus: item.initialStatus || "locked",
                    unlockAfter: item.unlockAfter,
                    unlockHint: item.unlockHint
                }]
                : [];
        const categoryTitle = document.getElementById("library-title").textContent;
        const categoryNames = {
            characters: "人物設定",
            world: "世界觀設定",
            maps: "地圖設定"
        };
        const novelConfigUrl = new URL(appState.currentNovelData.configPath, document.baseURI).href;
        const portrait = type === "characters" && item.portrait
            ? `<img class="library-portrait" src="${escapeHtml(resolvePath(novelConfigUrl, item.portrait))}" alt="${escapeHtml(item.name)}" tabindex="0" role="button" aria-label="放大${escapeHtml(item.name)}圖片">`
            : type === "characters"
                ? `<div class="library-portrait" aria-label="預設頭像">？</div>`
                : "";
        const mapImage = item.image
            ? `<img class="library-map-image" src="${escapeHtml(resolvePath(novelConfigUrl, item.image))}" alt="${escapeHtml(item.name)}" tabindex="0" role="button" aria-label="放大${escapeHtml(item.name)}圖片">`
            : "";
        const sectionContent = sections.length
            ? await renderUnlockSections(sections, item)
            : "";
        if (renderId !== detailRenderId) return;
        const regularContent = hasSections
            ? item.content
                ? unlocked
                    ? detailText
                        ? `<div class="library-detail-content">${formatText(detailText)}</div>`
                        : ""
                    : `<p class="locked-note">🔒 詳細資料尚未解鎖。${item.unlockHint ? ` ${escapeHtml(item.unlockHint)}` : ""}</p>`
                : ""
            : sections.length
                ? ""
            : unlocked
                ? detailText
                    ? `<div class="library-detail-content">${formatText(detailText)}</div>`
                    : item.content || item.description
                        ? ""
                        : `<div class="library-detail-content">尚未填寫詳細內容。</div>`
                : `<p class="locked-note">🔒 詳細資料尚未解鎖。${item.unlockHint ? ` ${escapeHtml(item.unlockHint)}` : ""}</p>`;

        detail.innerHTML = `
            <div class="library-entry-header">
                <div class="library-entry-heading">
                    <h2>${escapeHtml(item.name || item.title || "未命名")}</h2>
                    <p class="library-tags">${escapeHtml(categoryNames[type] || "")}${tags.length ? `　｜　${tags.map(escapeHtml).join("、")}` : ""}</p>
                </div>
                ${portrait}
            </div>
            ${regularContent}
            ${sectionContent}
            ${mapImage}
            ${links.length ? `<div class="library-links"><strong>相關資料：</strong>${links.map(link => `
                <button type="button" data-link-type="${escapeHtml(link.type)}" data-link-id="${escapeHtml(link.id)}">
                    ${escapeHtml(link.label || link.id)}
                </button>`).join("")}</div>` : ""}
        `;
        detail.querySelectorAll(".library-portrait[src], .library-map-image").forEach(image => {
            image.addEventListener("click", () => openImagePreview(image));
            image.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openImagePreview(image);
                }
            });
        });
        detail.querySelectorAll("[data-link-type]").forEach(button => {
            button.addEventListener("click", () => openLinkedEntry(button.dataset.linkType, button.dataset.linkId));
        });
        detail.querySelectorAll("[data-unlock-arc][data-unlock-chapter]").forEach(button => {
            button.addEventListener("click", () => openUnlockChapter(
                button.dataset.unlockArc,
                button.dataset.unlockChapter
            ));
        });
        setBreadcrumbs([
            ...setNovelBreadcrumb(categoryTitle, () => openDataLibrary(type)),
            { label: item.name || item.title || "資料內容" }
        ]);
        detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
        if (renderId === detailRenderId) {
            detail.textContent = "設定內容載入失敗。";
            onError(error);
        }
    }
}

function stripSummaryPrefix(content, summary) {
    const source = String(content || "");
    const normalizedSummary = String(summary || "").replace(/\s+/g, "");
    if (!normalizedSummary) return source;

    let matchedCharacters = 0;
    let sourceEnd = 0;
    while (sourceEnd < source.length && matchedCharacters < normalizedSummary.length) {
        if (!/\s/.test(source[sourceEnd])) {
            if (source[sourceEnd] !== normalizedSummary[matchedCharacters]) return source;
            matchedCharacters += 1;
        }
        sourceEnd += 1;
    }
    if (matchedCharacters !== normalizedSummary.length) return source;
    return source.slice(sourceEnd).replace(/^\s+/, "");
}

async function renderUnlockSections(sections, item) {
    const results = await Promise.all(sections.map(async section => {
        const rule = Array.isArray(section.unlockAfter)
            ? section.unlockAfter
            : Array.isArray(item.unlockAfter)
                ? item.unlockAfter
                : [];
        const targets = await Promise.all(rule.map(resolveUnlockTarget));
        const initialStatus = section.initialStatus || (rule.length ? "locked" : item.initialStatus || "open");
        const unlocked = initialStatus === "open"
            || initialStatus === "unlocked"
            || targets.some(target => appState.savedState.completedChapterIds.includes(String(target.chapter.id)));
        const isPublic = initialStatus === "open" || initialStatus === "unlocked";
        const requirement = targets.length && !isPublic
            ? `<p class="library-unlock-label">${unlocked ? "已解鎖" : "尚未解鎖"}：完成以下任一章節</p>
                <ul class="library-unlock-requirements">${targets.map(target => {
                    const completed = appState.savedState.completedChapterIds.includes(String(target.chapter.id));
                    const chapterNumber = target.chapter.number ? `第${target.chapter.number}章 ` : "";
                    const label = `${target.arc.title || target.arc.name || "未命名篇章"}／${chapterNumber}${target.chapter.title || target.chapter.id}`;
                    return `<li>
                        <button type="button" data-unlock-arc="${escapeHtml(target.arc.id)}" data-unlock-chapter="${escapeHtml(target.chapter.id)}">${escapeHtml(label)}</button>
                        <span>${completed ? "已完成" : "尚未完成"}</span>
                    </li>`;
                }).join("")}</ul>`
            : `<p class="library-unlock-label">${isPublic ? "目前公開，無需完成解鎖章節。" : "尚未解鎖。"}</p>`;
        const sectionText = stripSummaryPrefix(section.content || "", item.summary || "");
        const content = unlocked
            ? sectionText
                ? `<div class="library-detail-content">${formatText(sectionText)}</div>`
                : section.content
                    ? ""
                    : `<div class="library-detail-content">尚未填寫詳細內容。</div>`
            : `<p class="locked-note">🔒${section.unlockHint ? ` ${escapeHtml(section.unlockHint)}` : " 完成指定章節後解鎖。"}</p>`;

        return `<section class="library-detail-section">
            <h3>${escapeHtml(section.title || section.name || "設定分段")}</h3>
            ${requirement}
            ${content}
        </section>`;
    }));
    return results.join("");
}

async function resolveUnlockTarget(target) {
    const chapterId = typeof target === "string" ? target : target?.chapterId;
    const requestedArcId = typeof target === "object" && target ? target.arcId : null;
    if (!chapterId) throw new Error("設定解鎖條件缺少 chapterId。");

    const config = await loadNovelConfig();
    const arcs = config.story?.arcs || [];
    const candidates = requestedArcId
        ? arcs.filter(arc => String(arc.id) === String(requestedArcId))
        : arcs;
    if (requestedArcId && !candidates.length) {
        throw new Error(`找不到設定解鎖條件所屬篇章：${requestedArcId}`);
    }

    const configUrl = new URL(appState.currentNovelData.configPath, document.baseURI).href;
    for (const arc of candidates) {
        const loadedArc = await loadArcForReading(arc, configUrl);
        const chapter = loadedArc.chapters.find(item => String(item.id) === String(chapterId));
        if (chapter) return { arc: loadedArc, chapter };
    }
    throw new Error(`找不到設定解鎖條件所屬章節：${chapterId}`);
}

async function openUnlockChapter(arcId, chapterId) {
    if (!flushReaderProgress()) return;

    try {
        const config = await loadNovelConfig();
        const arc = (config.story?.arcs || []).find(item => String(item.id) === String(arcId));
        if (!arc) throw new Error(`找不到解鎖條件所屬篇章：${arcId}`);
        const configUrl = new URL(appState.currentNovelData.configPath, document.baseURI).href;
        const loadedArc = await loadArcForReading(arc, configUrl);
        const chapter = loadedArc.chapters.find(item => String(item.id) === String(chapterId));
        if (!chapter) throw new Error(`找不到解鎖條件所屬章節：${chapterId}`);
        appState.currentArc = loadedArc;
        closeSideMenu();
        await openStoryChapter(chapter);
    } catch (error) {
        onError(error);
    }
}

function openImagePreview(image) {
    const preview = document.getElementById("image-preview");
    const previewImage = document.getElementById("image-preview-content");
    previewImage.src = image.src;
    previewImage.alt = image.alt;
    document.getElementById("image-preview-caption").textContent = image.alt;
    preview.showModal();
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

function formatText(value) {
    return escapeHtml(value)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\r?\n/g, "<br>");
}

async function openLinkedEntry(type, id) {
    if (!LIBRARY_TYPES.includes(type)) {
        onError(new Error(`相關資料類型「${type}」無效。`));
        return;
    }

    try {
        await loadNovelConfig();
        const definition = appState.novelConfig.libraries?.[type];
        if (!definition?.index) throw new Error(`小說架構檔尚未設定「${type}」資料索引。`);
        const configUrl = new URL(appState.currentNovelData.configPath, document.baseURI).href;
        const indexUrl = resolvePath(configUrl, definition.index);
        const cacheKey = `${type}:${indexUrl}`;
        if (!appState.libraryCache.has(cacheKey)) {
            appState.libraryCache.set(cacheKey, fetchJson(indexUrl, `${definition.title || type}索引`));
        }
        const index = await appState.libraryCache.get(cacheKey);
        const entry = (index.items || []).find(item => String(item.id) === String(id));
        if (!entry) throw new Error(`找不到相關資料：${id}`);

        setLibraryPage(definition.title || "資料圖鑑", index.description || "");
        appState.libraryMode = type;
        appState.libraryItems = index.items || [];
        document.getElementById("library-search").hidden = false;
        setBreadcrumbs(setNovelBreadcrumb(definition.title || "資料圖鑑", () => openDataLibrary(type)));
        renderLibraryCards();
        showEntryDetail(entry, type);
    } catch (error) {
        onError(error);
    }
}

export async function resumeReading() {
    if (!flushReaderProgress()) return;
    try {
        const config = await loadNovelConfig();
        const arcs = config.story?.arcs || [];
        if (!arcs.length) throw new Error("這個小說世界尚未建立可閱讀的篇章。");

        const lastRead = appState.savedState.lastRead;
        const configUrl = new URL(appState.currentNovelData.configPath, document.baseURI).href;
        let targetArc = arcs[0];
        let targetChapter = null;

        if (lastRead) {
            const savedArcIndex = arcs.findIndex(item => item.id === lastRead.arcId);
            if (savedArcIndex < 0) throw new Error("找不到上次閱讀的篇章。");

            targetArc = await loadArcForReading(arcs[savedArcIndex], configUrl);
            targetChapter = targetArc.chapters.find(
                item => String(item.id) === String(lastRead.chapterId)
            );
            if (!targetChapter) throw new Error("找不到上次閱讀的章節。");
        } else {
            targetArc = await loadArcForReading(targetArc, configUrl);
            targetChapter = targetArc.chapters[0];
        }

        if (!targetChapter) throw new Error("這個小說世界目前沒有可閱讀的章節。");
        if (!targetArc.indexUrl) targetArc = await loadArcForReading(targetArc, configUrl);
        appState.currentArc = targetArc;
        closeSideMenu();
        await openStoryChapter(targetChapter);
    } catch (error) {
        onError(error);
    }
}

async function loadArcForReading(arc, configUrl) {
    const indexUrl = resolvePath(configUrl, arc.index);
    const cacheKey = `arc:${indexUrl}`;
    if (!appState.libraryCache.has(cacheKey)) {
        appState.libraryCache.set(
            cacheKey,
            fetchJson(indexUrl, `篇章「${arc.title || arc.name}」索引`)
        );
    }
    const index = await appState.libraryCache.get(cacheKey);
    return {
        ...arc,
        indexUrl,
        indexTitle: index.title,
        indexDescription: index.description,
        chapters: Array.isArray(index.chapters) ? index.chapters : []
    };
}

export async function openNextArcChapter() {
    const session = appState.readerSession;
    if (!session) return false;

    try {
        const config = await loadNovelConfig();
        const arcs = config.story?.arcs || [];
        const currentArcIndex = arcs.findIndex(arc => arc.id === session.arc.id);
        if (currentArcIndex < 0) throw new Error("找不到目前閱讀的篇章。");

        const configUrl = new URL(appState.currentNovelData.configPath, document.baseURI).href;
        for (let index = currentArcIndex + 1; index < arcs.length; index += 1) {
            const arc = await loadArcForReading(arcs[index], configUrl);
            const chapter = arc.chapters[0];
            if (!chapter) continue;

            appState.currentArc = arc;
            closeSideMenu();
            await openStoryChapter(chapter);
            return true;
        }
        return false;
    } catch (error) {
        onError(error);
        return false;
    }
}

export function openBookmarks() {
    if (!flushReaderProgress()) return;

    try {
        setLibraryPage("閱讀書籤", "收藏的章節會集中於此，可跨小說與篇章快速跳轉。");
        appState.libraryMode = "bookmarks";
        document.getElementById("library-search").hidden = false;
        document.getElementById("library-list").classList.add("bookmarks-list");
        setBreadcrumbs([{ label: "閱讀書籤" }]);
        renderLibraryCards();
        closeSideMenu();
    } catch (error) {
        onError(error);
    }
}

export function updateResumeButton() {
    const button = document.getElementById("resume-reading");
    if (!button) return;
    button.hidden = false;
    button.disabled = !appState.savedState?.lastRead;
}
