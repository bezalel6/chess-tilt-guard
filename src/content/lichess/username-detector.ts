import { CACHED_LICHESS_USERNAME_KEY } from "../../constants";

const LOG = "[CTG LichessUser]";

/**
 * Selectors to find the logged-in user's username on Lichess.
 * Tried in priority order; the first match wins.
 */
const USERNAME_SELECTORS = [
  // Lila framework sets data-user on <body> for logged-in users
  { selector: "body[data-user]", attr: "data-user" },
  // Top-right dasher menu username
  { selector: "#user_tag", attr: null },
  { selector: ".dasher .text", attr: null },
];

function findUsernameFromDom(): string | null {
  for (const { selector, attr } of USERNAME_SELECTORS) {
    const el = document.querySelector(selector);
    if (!el) continue;

    const value = attr ? el.getAttribute(attr) : el.textContent?.trim();
    if (value) return value.toLowerCase();
  }
  return null;
}

async function getCachedUsername(): Promise<string | null> {
  const data = await chrome.storage.local.get(CACHED_LICHESS_USERNAME_KEY);
  return data[CACHED_LICHESS_USERNAME_KEY] ?? null;
}

async function cacheUsername(username: string): Promise<void> {
  await chrome.storage.local.set({ [CACHED_LICHESS_USERNAME_KEY]: username });
}

/**
 * Try to find the Lichess username, first from DOM then from cache.
 * If found in DOM, update the cache.
 */
export async function resolveLichessUsername(): Promise<string | null> {
  const fromDom = findUsernameFromDom();
  if (fromDom) {
    await cacheUsername(fromDom);
    console.log(LOG, "Resolved username:", fromDom);
    return fromDom;
  }
  return getCachedUsername();
}
