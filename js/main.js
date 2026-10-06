import { appState } from "./app-state.js";
import {
    configureCatalog,
    initializeCatalog,
    openBookmarks,
    openChapterList,
    openDataLibrary,
    openHome,
    openNextArcChapter,
    openNovelHome,
    openArc,
    resumeReading,
    selectNovel,
    toggleSideMenu,
    updateResumeButton
} from "./catalog.js?v=20261002-29";
import {
    completeOrNextChapter,
    configureReader,
    previousChapter
} from "./reader.js?v=20261002-29";
import { setBreadcrumbs, switchScreen } from "./navigation.js?v=20261002-29";
import { initializeReadingPresentation } from "./reading-presentation.js";
import { initializeSettings, openSettings } from "./settings.js?v=20261002-29";

function reportError(error) {
    console.error(error);
    const title = document.getElementById("library-title");
    const description = document.getElementById("library-description");
    const list = document.getElementById("library-list");
    const detail = document.getElementById("library-detail");
    const search = document.getElementById("library-search");

    title.textContent = "載入失敗";
    description.textContent = "";
    list.replaceChildren();
    list.hidden = true;
    search.hidden = true;
    detail.hidden = false;
    detail.textContent = error.message || String(error);

    const breadcrumbs = appState.currentNovelData
        ? [{ label: appState.currentNovelData.title, activate: openNovelHome }, { label: "載入失敗" }]
        : [{ label: "載入失敗" }];
    setBreadcrumbs(breadcrumbs);
    switchScreen("screen-library");
}

configureCatalog({ onError: reportError });
configureReader({
    navigation: {
        openNovelHome,
        openChapterList,
        openArc,
        openNextArcChapter
    },
    onProgressSaved: updateResumeButton,
    onError: reportError
});

initializeReadingPresentation();
initializeSettings(reportError);
setBreadcrumbs([]);
initializeCatalog();

window.goToLayer = function(layer) {
    if (layer === "home") openHome();
    if (layer === "novel-home") openNovelHome();
};

window.toggleSideMenu = toggleSideMenu;
window.selectNovel = selectNovel;
window.openChapterList = openChapterList;
window.openCharacterList = () => openDataLibrary("characters");
window.openWorldList = () => openDataLibrary("world");
window.openMapList = () => openDataLibrary("maps");
window.openBookmarks = openBookmarks;
window.openSettings = openSettings;
window.resumeReading = resumeReading;
window.previousChapter = previousChapter;
window.completeOrNextChapter = completeOrNextChapter;
window.loadGame = resumeReading;
function resizeGameCanvas() {
    const canvas = document.getElementById("game-canvas");
    if (!canvas) return;

    if (document.body.classList.contains("reader-mode")) {
        canvas.style.zoom = "1";
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        canvas.style.top = "0";
        canvas.style.left = "0";
        canvas.style.transform = "none";
        return;
    }

    canvas.style.width = "1600px";
    canvas.style.height = "900px";
    canvas.style.zoom = "1";
    canvas.style.top = "50%";
    canvas.style.left = "50%";

    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width <= 700) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.top = "0";
        canvas.style.left = "0";
        canvas.style.transform = "none";
        canvas.style.zoom = "1";
        return;
    }

    const isPortrait = height > width;
    const scale = isPortrait
        ? Math.min(width / 900, height / 1600)
        : Math.min(width / 1600, height / 900);

    canvas.style.transform = isPortrait
        ? `translate(-50%, -50%) rotate(90deg) scale(${scale})`
        : `translate(-50%, -50%) scale(${scale})`;
}

window.addEventListener("resize", resizeGameCanvas);
window.addEventListener("orientationchange", resizeGameCanvas);
resizeGameCanvas();
