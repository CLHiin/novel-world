import { updateDisplaySettingLabel } from "./reading-presentation.js";

let breadcrumbItems = [];

export function setBreadcrumbs(items) {
    breadcrumbItems = items;
    renderBreadcrumbs();
}

export function getBreadcrumbs() {
    return breadcrumbItems;
}

function renderBreadcrumbs() {
    const container = document.getElementById("breadcrumb-items");
    container.replaceChildren();

    breadcrumbItems.forEach((item, index) => {
        const separator = document.createElement("span");
        separator.className = "breadcrumb-separator";
        separator.textContent = "›";
        container.appendChild(separator);

        const isCurrent = index === breadcrumbItems.length - 1;
        const canNavigate = typeof item.activate === "function";
        const crumb = isCurrent || !canNavigate
            ? document.createElement("span")
            : document.createElement("button");
        crumb.className = "breadcrumb-item";
        crumb.textContent = item.label;

        if (isCurrent) {
            crumb.setAttribute("aria-current", "page");
        } else if (canNavigate) {
            crumb.type = "button";
            crumb.addEventListener("click", () => {
                const destination = breadcrumbItems[index];
                setBreadcrumbs(breadcrumbItems.slice(0, index + 1));
                destination.activate();
            });
        }
        container.appendChild(crumb);
    });
}

export function switchScreen(screenId) {
    document.querySelectorAll(".screen").forEach(screen => {
        screen.style.display = "none";
    });
    document.getElementById(screenId).style.display = "flex";
    document.body.classList.toggle("reader-mode", screenId === "screen-reader");
    updateDisplaySettingLabel(screenId === "screen-reader");
    document.body.classList.toggle("settings-mode", screenId === "screen-settings");
    window.dispatchEvent(new Event("resize"));
}
