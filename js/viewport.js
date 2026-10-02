const DESIGN_RATIO = 16 / 9;

export function updateViewport() {
  const root = document.documentElement;
  root.style.setProperty("--design-ratio", DESIGN_RATIO);

  const portrait = window.innerHeight > window.innerWidth;
  const mobile = Math.min(window.innerWidth, window.innerHeight) <= 900;
  const notice = document.getElementById("orientationNotice");

  if (notice) {
    notice.hidden = !(portrait && mobile);
  }

  // 能鎖方向就嘗試鎖定；瀏覽器不允許時不影響網站。
  if (portrait && mobile && screen.orientation?.lock) {
    screen.orientation.lock("landscape").catch(() => {});
  }
}

export function initViewport() {
  updateViewport();
  window.addEventListener("resize", updateViewport);
  window.addEventListener("orientationchange", updateViewport);
}
