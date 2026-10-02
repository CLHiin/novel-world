import { appState } from "./app-state.js";

const DISPLAY_SIZES = ["small", "medium", "large"];
const SIZE_KEY = "novel-interface-size-v2";
const SIZE_LABELS = {
    small: "小",
    medium: "中",
    large: "大"
};

export function initializeReadingPresentation() {
    const savedSize = localStorage.getItem(SIZE_KEY);
    if (DISPLAY_SIZES.includes(savedSize)) appState.currentUISize = savedSize;

    document.querySelectorAll("[data-reader-size]").forEach(button => {
        button.addEventListener("click", () => setReaderDisplaySize(button.dataset.readerSize));
    });
    applyReaderDisplaySize();
}

export function setReaderDisplaySize(size) {
    if (!DISPLAY_SIZES.includes(size)) {
        throw new Error(`未知的介面大小：${size}`);
    }
    appState.currentUISize = size;
    localStorage.setItem(SIZE_KEY, size);
    applyReaderDisplaySize();
}

function applyReaderDisplaySize() {
    document.body.classList.remove(...DISPLAY_SIZES.map(size => `ui-size-${size}`));
    document.body.classList.add(`ui-size-${appState.currentUISize}`);

    document.querySelectorAll("[data-reader-size]").forEach(button => {
        button.setAttribute(
            "aria-pressed",
            String(button.dataset.readerSize === appState.currentUISize)
        );
    });

    document.getElementById("display-size-label").textContent =
        document.body.classList.contains("reader-mode") ? "文字大小" : "介面大小";
    window.dispatchEvent(new Event("ui-size-change"));
}

export function updateDisplaySettingLabel(isReaderMode) {
    document.getElementById("display-size-label").textContent =
        isReaderMode ? "文字大小" : "介面大小";
}
