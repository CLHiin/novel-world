const cache = new Map();

export async function fetchText(url) {
  if (cache.has(url)) return cache.get(url);

  const promise = fetch(url, { cache: "no-cache" }).then(async response => {
    if (!response.ok) {
      throw new Error(`載入失敗：${response.status} ${url}`);
    }
    return response.text();
  });

  cache.set(url, promise);
  return promise;
}

export function preload(url) {
  if (!cache.has(url)) fetchText(url).catch(() => {});
}

export function observePreload(element, url, root = null) {
  if (!element || !url) return;

  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      preload(url);
      observer.disconnect();
    }
  }, { root, rootMargin: "800px" });

  observer.observe(element);
}

export function lazyImages(root = document) {
  root.querySelectorAll("img[data-src]").forEach(img => {
    const load = () => {
      img.src = img.dataset.src;
      img.removeAttribute("data-src");
    };

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          load();
          observer.disconnect();
        }
      }, { rootMargin: "800px" });
      observer.observe(img);
    } else {
      load();
    }
  });
}