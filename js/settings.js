import { appState } from "./app-state.js";
import { setReaderDisplaySize } from "./reading-presentation.js";
import { switchScreen } from "./navigation.js?v=20261002-29";
import { flushReaderProgress } from "./reader.js?v=20261002-29";

const SETTINGS_KEY = "novel-reader-presentation-v1";
const SIZE_KEY = "novel-interface-size-v2";
const BOOKMARKS_KEY = "novel-reader-bookmarks-v1";
const LAST_NOVEL_KEY = "novel-reader-last-novel";
const NOVEL_SAVE_PREFIX = "novel-reader-v1:";
const BACKUP_FORMAT = "novel-reader-backup";
const BACKUP_VERSION = 1;
const SIZE_ORDER = ["large", "medium", "small"];
const SIZE_LABELS = { large: "大", medium: "中", small: "小" };

const SIZE_FIELDS = {
    home: [
        ["titleSize", "首頁標題文字大小", 16, 72, "px"],
        ["bodySize", "首頁一般文字大小", 12, 48, "px"],
        ["cardSize", "小說卡片文字大小", 12, 48, "px"],
        ["columns", "首頁每列圖片數", 1, 6, "個"]
    ],
    novel: [
        ["titleSize", "小說世界標題文字大小", 18, 80, "px"],
        ["subtitleSize", "小說世界副標題文字大小", 12, 48, "px"],
        ["majorSize", "大區塊按鈕文字大小", 12, 56, "px"],
        ["minorSize", "小區塊按鈕文字大小", 12, 48, "px"],
        ["majorColumns", "大區塊每列按鈕數", 1, 4, "個"],
        ["minorColumns", "小區塊每列按鈕數", 1, 6, "個"]
    ],
    library: [
        ["titleSize", "列表主標題文字大小", 16, 56, "px"],
        ["subtitleSize", "列表副標題文字大小", 12, 40, "px"],
        ["searchSize", "列表搜尋文字大小", 12, 36, "px"],
        ["cardTitleSize", "列表選項標題文字大小", 12, 40, "px"],
        ["cardBodySize", "列表選項說明文字大小", 10, 32, "px"],
        ["columns", "列表每列選項數", 1, 6, "個"]
    ],
    reader: [
        ["titleSize", "篇章／章節標題文字大小", 12, 40, "px"],
        ["bodySize", "小說正文文字大小", 14, 40, "px"],
        ["auxSize", "輔助文字／閱讀進度大小", 10, 32, "px"],
        ["buttonSize", "篇章操作按鈕文字大小", 10, 32, "px"]
    ]
};

const DEFAULT_SETTINGS = {
    home: {
        titleSize: { large: 42, medium: 38, small: 34 },
        bodySize: { large: 22, medium: 20, small: 18 },
        cardSize: { large: 22, medium: 20, small: 18 },
        columns: { large: 2, medium: 3, small: 4 },
        showNavigation: true
    },
    novel: {
        titleSize: { large: 54, medium: 48, small: 42 },
        subtitleSize: { large: 22, medium: 20, small: 18 },
        majorSize: { large: 28, medium: 24, small: 20 },
        minorSize: { large: 24, medium: 20, small: 17 },
        majorColumns: { large: 2, medium: 2, small: 2 },
        minorColumns: { large: 3, medium: 3, small: 2 }
    },
    library: {
        titleSize: { large: 36, medium: 30, small: 24 },
        subtitleSize: { large: 22, medium: 19, small: 16 },
        searchSize: { large: 20, medium: 18, small: 16 },
        cardTitleSize: { large: 24, medium: 21, small: 18 },
        cardBodySize: { large: 18, medium: 16, small: 14 },
        columns: { large: 4, medium: 3, small: 2 }
    },
    reader: {
        titleSize: { large: 20, medium: 18, small: 16 },
        bodySize: { large: 26, medium: 22, small: 18 },
        auxSize: { large: 20, medium: 18, small: 16 },
        buttonSize: { large: 20, medium: 18, small: 16 }
    }
};

let settings = structuredClone(DEFAULT_SETTINGS);

export function initializeSettings(onError) {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) settings = parseSettings(JSON.parse(saved));
    } catch (error) {
        onError(error);
    }
    renderSizeFields();
    populateSettingsForm();
    applySettings();
    document.querySelectorAll("[data-settings-reset]").forEach(button => {
        button.addEventListener("click", () => resetSettings(button.dataset.settingsReset));
    });
    document.getElementById("settings-export").addEventListener("click", exportBackup);
    document.getElementById("settings-import-trigger").addEventListener("click", () => {
        document.getElementById("settings-import-file").click();
    });
    document.getElementById("settings-import-file").addEventListener("change", event => {
        importBackup(event.currentTarget.files[0]);
        event.currentTarget.value = "";
    });

    window.addEventListener("ui-size-change", applySettings);
}

export function openSettings() {
    if (!flushReaderProgress()) return;
    document.getElementById("side-menu").classList.remove("open");
    populateSettingsForm();
    applySettings();
    document.querySelector(".settings-content").scrollTop = 0;
    document.getElementById("settings-status").textContent = "";
    switchScreen("screen-settings");
}

function updateSettingFromControl(event) {
    const input = event.currentTarget;
    const path = input.dataset.setting.split(".");
    let value;

    if (input.type === "checkbox") {
        value = input.checked;
    } else {
        const minimum = Number(input.min);
        const maximum = Number(input.max);
        value = Number(input.value);
        if (!Number.isFinite(value)) return;
        value = Math.min(maximum, Math.max(minimum, Math.round(value)));
        input.value = String(value);
    }

    let target = settings;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path[path.length - 1]] = value;
    saveSettings();
    applySettings();
}

function populateSettingsForm() {
    document.querySelectorAll("[data-setting]").forEach(input => {
        const value = input.dataset.setting.split(".").reduce((target, key) => target[key], settings);
        if (input.type === "checkbox") input.checked = value;
        else input.value = String(value);
    });
}

function renderSizeFields() {
    Object.entries(SIZE_FIELDS).forEach(([section, fields]) => {
        const container = document.querySelector(`[data-settings-fields="${section}"]`);
        const checkbox = container.querySelector(".settings-checkbox");

        fields.forEach(([key, label, minimum, maximum, unit]) => {
            const field = document.createElement("fieldset");
            field.className = "settings-triad";

            const legend = document.createElement("legend");
            legend.textContent = label;

            const values = document.createElement("div");
            values.className = "settings-size-values";
            SIZE_ORDER.forEach(size => {
                const value = document.createElement("label");
                value.className = "settings-size-value";
                const name = document.createElement("span");
                name.textContent = `${SIZE_LABELS[size]}【`;
                const input = document.createElement("input");
                input.type = "number";
                input.min = String(minimum);
                input.max = String(maximum);
                input.step = "1";
                input.dataset.setting = `${section}.${key}.${size}`;
                input.setAttribute("aria-label", `${label}，${SIZE_LABELS[size]}尺寸`);
                const suffix = document.createElement("span");
                suffix.textContent = unit === "px" ? `px】` : `${unit}】`;
                value.append(name, input, suffix);
                values.appendChild(value);
            });

            field.append(legend, values);
            container.insertBefore(field, checkbox);
        });
    });

    document.querySelectorAll("[data-setting]").forEach(input => {
        input.addEventListener("input", updateSettingFromControl);
        input.addEventListener("change", updateSettingFromControl);
    });
}

function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function resetSettings(section) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, section)) {
        setSettingsStatus(`無法恢復未知的設定區塊：${section}`, true);
        return;
    }
    settings[section] = structuredClone(DEFAULT_SETTINGS[section]);
    saveSettings();
    populateSettingsForm();
    applySettings();
    setSettingsStatus(`${document.querySelector(`[data-settings-reset="${section}"]`)
        .closest(".settings-group").querySelector("h2").textContent}已恢復預設。`);
}

function applySettings() {
    const root = document.documentElement;
    const size = appState.currentUISize;
    const valueForSize = (section, field) => settings[section][field][size];
    const variables = {
        "--setting-home-title-size": valueForSize("home", "titleSize"),
        "--setting-home-body-size": valueForSize("home", "bodySize"),
        "--setting-home-card-size": valueForSize("home", "cardSize"),
        "--setting-novel-title-size": valueForSize("novel", "titleSize"),
        "--setting-novel-subtitle-size": valueForSize("novel", "subtitleSize"),
        "--setting-novel-major-size": valueForSize("novel", "majorSize"),
        "--setting-novel-minor-size": valueForSize("novel", "minorSize"),
        "--setting-library-title-size": valueForSize("library", "titleSize"),
        "--setting-library-subtitle-size": valueForSize("library", "subtitleSize"),
        "--setting-library-search-size": valueForSize("library", "searchSize"),
        "--setting-library-card-title-size": valueForSize("library", "cardTitleSize"),
        "--setting-library-card-body-size": valueForSize("library", "cardBodySize"),
        "--setting-reader-title-size": valueForSize("reader", "titleSize"),
        "--setting-reader-body-size": valueForSize("reader", "bodySize"),
        "--setting-reader-aux-size": valueForSize("reader", "auxSize"),
        "--setting-reader-button-size": valueForSize("reader", "buttonSize"),
        "--novel-title-font-size": valueForSize("novel", "titleSize"),
        "--screen-body-font-size": valueForSize("home", "bodySize"),
        "--home-title-font-size": valueForSize("home", "titleSize"),
        "--description-font-size": valueForSize("novel", "subtitleSize"),
        "--card-title-font-size": valueForSize("home", "cardSize"),
        "--novel-menu-font-size": valueForSize("novel", "majorSize"),
        "--library-title-font-size": valueForSize("library", "titleSize"),
        "--library-description-font-size": valueForSize("library", "subtitleSize"),
        "--library-search-font-size": valueForSize("library", "searchSize"),
        "--library-card-title-font-size": valueForSize("library", "cardTitleSize"),
        "--library-card-body-font-size": valueForSize("library", "cardBodySize"),
        "--library-card-font-size": valueForSize("library", "cardBodySize"),
        "--library-detail-font-size": valueForSize("home", "bodySize"),
        "--utility-font-size": valueForSize("reader", "auxSize"),
        "--reader-heading-font-size": valueForSize("reader", "titleSize"),
        "--reader-control-font-size": valueForSize("reader", "buttonSize"),
        "--size-control-font-size": valueForSize("reader", "buttonSize"),
        "--portrait-placeholder-font-size": Math.round(valueForSize("home", "titleSize") * 1.5),
        "--reading-font-size": valueForSize("reader", "bodySize")
    };
    Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, `${value}px`));
    root.style.setProperty("--library-columns", settings.library.columns[size]);
    document.body.classList.toggle("hide-route-breadcrumbs", !settings.home.showNavigation);
    document.querySelector(".settings-preview-home").style.setProperty(
        "--preview-home-columns",
        settings.home.columns[size]
    );
    document.querySelector(".settings-preview-novel").style.setProperty(
        "--preview-minor-columns",
        settings.novel.minorColumns[size]
    );
    document.querySelector(".settings-preview-major").style.setProperty(
        "--preview-major-columns",
        settings.novel.majorColumns[size]
    );
    document.querySelector(".settings-preview-library-list").style.setProperty(
        "--preview-library-columns",
        settings.library.columns[size]
    );
    document.querySelector(".settings-preview-library-search").style.fontSize =
        `${valueForSize("library", "searchSize")}px`;
    applyLayoutSettings();
}

function applyLayoutSettings() {
    const size = appState.currentUISize;
    const wall = document.getElementById("novel-wall");
    if (wall) {
        const columns = settings.home.columns[size] || DEFAULT_SETTINGS.home.columns[size];
        wall.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    }
    document.querySelectorAll(".novel-menu-major").forEach(group => {
        group.style.gridTemplateColumns = `repeat(${settings.novel.majorColumns[size]}, minmax(0, 1fr))`;
    });
    document.querySelectorAll(".novel-menu-minor").forEach(group => {
        group.style.gridTemplateColumns = `repeat(${settings.novel.minorColumns[size]}, minmax(0, 1fr))`;
    });
}

function parseSettings(input) {
    if (!input || typeof input !== "object") throw new Error("介面設定格式無效。");
    const merged = structuredClone(DEFAULT_SETTINGS);
    for (const [section, fields] of Object.entries(SIZE_FIELDS)) {
        for (const [field, label, minimum, maximum] of fields) {
            const value = input[section]?.[field];
            if (value === undefined) continue;
            if (typeof value === "number") {
                if (!Number.isInteger(value) || value < minimum || value > maximum) {
                    throw new Error(`設定「${label}」必須是 ${minimum} 到 ${maximum} 的整數。`);
                }
                merged[section][field].medium = value;
                continue;
            }
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new Error(`設定「${label}」格式無效。`);
            }
            for (const size of SIZE_ORDER) {
                if (value[size] === undefined) continue;
                if (!Number.isInteger(value[size]) || value[size] < minimum || value[size] > maximum) {
                    throw new Error(`設定「${label}」的大／中／小數值必須是 ${minimum} 到 ${maximum} 的整數。`);
                }
                merged[section][field][size] = value[size];
            }
        }
    }
    for (const path of ["home.showNavigation"]) {
        const value = path.split(".").reduce((target, key) => target?.[key], input);
        if (value !== undefined && typeof value !== "boolean") {
            throw new Error(`設定「${path}」必須是布林值。`);
        }
        if (value !== undefined) {
            const [section, key] = path.split(".");
            merged[section][key] = value;
        }
    }
    return merged;
}

function getManagedRecords() {
    return Object.fromEntries(Object.keys(localStorage)
        .filter(key => key === SIZE_KEY
            || key === SETTINGS_KEY
            || key === BOOKMARKS_KEY
            || key === LAST_NOVEL_KEY
            || key.startsWith(NOVEL_SAVE_PREFIX))
        .map(key => [key, localStorage.getItem(key)]));
}

function exportBackup() {
    try {
        const backup = {
            format: BACKUP_FORMAT,
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            records: {
                ...getManagedRecords(),
                [SETTINGS_KEY]: JSON.stringify(settings),
                [SIZE_KEY]: appState.currentUISize
            }
        };
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob(
            [JSON.stringify(backup, null, 2)],
            { type: "application/json" }
        ));
        link.download = `novel-reader-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        setSettingsStatus("設定與閱讀紀錄已匯出。");
    } catch (error) {
        setSettingsStatus(`匯出失敗：${error.message}`, true);
    }
}

async function importBackup(file) {
    if (!file) return;
    try {
        const parsed = JSON.parse(await file.text());
        if (parsed.format !== BACKUP_FORMAT || parsed.version !== BACKUP_VERSION) {
            throw new Error("備份格式或版本不相容。");
        }
        const records = validateRecords(parsed.records);
        if (!window.confirm("匯入會取代本機現有的介面設定、閱讀紀錄與書籤。要繼續嗎？")) return;

        const previous = getManagedRecords();
        try {
            Object.keys(previous).forEach(key => localStorage.removeItem(key));
            Object.entries(records).forEach(([key, value]) => localStorage.setItem(key, value));
            if (!records[SIZE_KEY]) localStorage.setItem(SIZE_KEY, "medium");
        } catch (error) {
            Object.keys(getManagedRecords()).forEach(key => localStorage.removeItem(key));
            Object.entries(previous).forEach(([key, value]) => localStorage.setItem(key, value));
            throw error;
        }

        settings = records[SETTINGS_KEY]
            ? parseSettings(JSON.parse(records[SETTINGS_KEY]))
            : structuredClone(DEFAULT_SETTINGS);
        setReaderDisplaySize(records[SIZE_KEY] || "medium");
        populateSettingsForm();
        applySettings();
        setSettingsStatus("備份已匯入；正在重新載入以套用閱讀紀錄。");
        window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
        setSettingsStatus(`匯入失敗：${error.message}`, true);
        console.error("無法匯入設定與閱讀紀錄：", error);
    }
}

function validateRecords(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("備份缺少有效的紀錄資料。");
    }
    const records = {};
    for (const [key, value] of Object.entries(input)) {
        if (typeof value !== "string" || !(key === SIZE_KEY
            || key === SETTINGS_KEY
            || key === BOOKMARKS_KEY
            || key === LAST_NOVEL_KEY
            || key.startsWith(NOVEL_SAVE_PREFIX))) {
            throw new Error(`備份含有無效或不支援的資料：${key}`);
        }
        if (key === SIZE_KEY && !["small", "medium", "large"].includes(value)) {
            throw new Error("備份中的介面大小無效。");
        }
        if (key === SETTINGS_KEY) parseSettings(JSON.parse(value));
        if (key === BOOKMARKS_KEY) validateBookmarkRecords(JSON.parse(value));
        if (key.startsWith(NOVEL_SAVE_PREFIX)) validateNovelSave(JSON.parse(value));
        records[key] = value;
    }
    return records;
}

function validateNovelSave(state) {
    if (!state || !Array.isArray(state.completedChapterIds)
        || (state.lastRead !== null && state.lastRead !== undefined
            && (typeof state.lastRead.arcId !== "string"
                || typeof state.lastRead.chapterId !== "string"
                || !isValidScrollPosition(state.lastRead)))) {
        throw new Error("備份中含有格式無效的小說閱讀紀錄。");
    }
}

function validateBookmarkRecords(bookmarks) {
    if (!Array.isArray(bookmarks) || bookmarks.some(bookmark =>
        !bookmark || typeof bookmark.novelKey !== "string"
        || typeof bookmark.novelId !== "string"
        || typeof bookmark.arcId !== "string"
        || typeof bookmark.chapterId !== "string"
        || !isValidScrollPosition(bookmark)
    )) {
        throw new Error("備份中含有格式無效的閱讀書籤。");
    }
}

function isValidScrollPosition(record) {
    return (record.scrollTop === undefined
        || (Number.isFinite(record.scrollTop) && record.scrollTop >= 0))
        && (record.scrollRatio === undefined
            || (Number.isFinite(record.scrollRatio) && record.scrollRatio >= 0 && record.scrollRatio <= 1))
        && (record.progressRatio === undefined
            || (Number.isFinite(record.progressRatio)
                && record.progressRatio >= 0
                && record.progressRatio <= 1));
}

function setSettingsStatus(message, isError = false) {
    const status = document.getElementById("settings-status");
    status.textContent = message;
    status.classList.toggle("settings-error", isError);
}
