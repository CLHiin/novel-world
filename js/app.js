import { initViewport } from "./viewport.js";
import { fetchText, preload, lazyImages } from "./lazy-loader.js";

const NOVEL_ROOT = "./系統素材與資料/小說素材/";
const NOVEL_ID = "天賦權能";
const NOVEL_CONFIG = `${NOVEL_ROOT}${NOVEL_ID}/小說定義/web.json`;

const app = document.getElementById("app");
let novel = null;

initViewport();

window.addEventListener("hashchange", render);

async function loadNovel() {
  if (novel) return novel;
  const response = await fetch(NOVEL_CONFIG);
  if (!response.ok) throw new Error(`無法載入小說定義：${response.status}`);
  novel = await response.json();
  return novel;
}

function path() {
  return location.hash.replace(/^#/, "") || "/";
}

function renderLoading() {
  app.innerHTML = `<section class="page"><div class="card">載入中……</div></section>`;
}

function renderError(error) {
  app.innerHTML = `
    <section class="page">
      <div class="card">
        <h1>載入失敗</h1>
        <p class="muted">${escapeHtml(error.message)}</p>
      </div>
    </section>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function renderHome() {
  app.innerHTML = `
    <section class="page">
      <div class="card">
        <h1>${escapeHtml(novel.title)}</h1>
        <p class="muted">${escapeHtml(novel.description ?? "")}</p>
        <div class="nav">
          <button data-route="#/chapters">開始閱讀</button>
        </div>
      </div>
    </section>`;

  app.querySelector("button").onclick = () => location.hash = "/chapters";
}

function renderChapters() {
  const chapters = novel.chapters ?? [];
  app.innerHTML = `
    <section class="page">
      <div class="nav">
        <button id="home">← 小說首頁</button>
      </div>
      <div class="card">
        <h1>章節</h1>
        <div id="chapterList"></div>
      </div>
    </section>`;

  app.querySelector("#home").onclick = () => location.hash = "/";

  const list = app.querySelector("#chapterList");
  chapters.forEach((chapter, index) => {
    const button = document.createElement("button");
    button.textContent = `${chapter.id}　${chapter.title}`;
    button.style.display = "block";
    button.style.margin = "10px 0";
    button.onclick = () => location.hash = `/chapter/${encodeURIComponent(chapter.id)}`;
    list.appendChild(button);

    // 提前快取下一章定義對應的 Markdown，但不載入正文。
    if (index === 0 && chapters[1]) {
      preload(chapterUrl(chapters[1]));
    }
  });
}

function chapterUrl(chapter) {
  return `${NOVEL_ROOT}${NOVEL_ID}/章節/${chapter.file}`;
}

async function renderChapter(id) {
  const chapters = novel.chapters ?? [];
  const index = chapters.findIndex(c => String(c.id) === String(id));
  if (index < 0) throw new Error("找不到這個章節。");

  const chapter = chapters[index];
  const markdown = await fetchText(chapterUrl(chapter));

  app.innerHTML = `
    <section class="page">
      <div class="nav">
        <button id="back">← 章節列表</button>
        ${index > 0 ? `<button id="prev">上一章</button>` : ""}
        ${index < chapters.length - 1 ? `<button id="next">下一章</button>` : ""}
      </div>
      <article id="chapterContent" class="card chapter-content">
        ${markdownToHtml(markdown)}
      </article>
    </section>`;

  app.querySelector("#back").onclick = () => location.hash = "/chapters";

  const next = chapters[index + 1];
  if (next) {
    const nextUrl = chapterUrl(next);
    preload(nextUrl);
    const nextButton = app.querySelector("#next");
    if (nextButton) nextButton.onclick = () => location.hash = `/chapter/${encodeURIComponent(next.id)}`;
  }

  const prev = chapters[index - 1];
  const prevButton = app.querySelector("#prev");
  if (prevButton && prev) {
    prevButton.onclick = () => location.hash = `/chapter/${encodeURIComponent(prev.id)}`;
  }

  lazyImages(app);
}

function markdownToHtml(markdown) {
  // 第一版先處理基本 Markdown；之後可替換成正式 Markdown parser。
  return markdown
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^---$/gm, "<hr>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .split(/\n\n+/)
    .map(block => {
      if (/^<h[1-3]|^<hr/.test(block.trim())) return block;
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

async function render() {
  renderLoading();

  try {
    await loadNovel();
    const current = path();

    if (current === "/") return renderHome();
    if (current === "/chapters") return renderChapters();

    const match = current.match(/^\/chapter\/(.+)$/);
    if (match) return await renderChapter(decodeURIComponent(match[1]));

    location.hash = "/";
  } catch (error) {
    console.error(error);
    renderError(error);
  }
}

render();
