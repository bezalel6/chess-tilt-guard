/**
 * Watches for SPA-style URL changes via MutationObserver.
 * Calls `callback` whenever `location.href` changes.
 */
export function watchNavigation(callback: (url: string) => void): void {
  let lastUrl = location.href;

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      callback(lastUrl);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
