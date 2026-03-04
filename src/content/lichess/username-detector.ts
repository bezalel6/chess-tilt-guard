import { StoredUsernames } from "../../types";
import { USERNAMES_KEY } from "../../constants";

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

/**
 * Resolve the Lichess username.
 * 1. If a manual override exists, use it immediately (no DOM detection).
 * 2. Otherwise, try DOM detection and save as auto-detected.
 * 3. Fall back to any existing auto-detected value.
 */
export async function resolveLichessUsername(): Promise<string | null> {
  const data = await chrome.storage.local.get(USERNAMES_KEY);
  const stored: StoredUsernames = data[USERNAMES_KEY] ?? {};
  const entry = stored.lichess;

  // Manual override — use it, skip DOM detection entirely
  if (entry?.source === "manual") {
    return entry.username;
  }

  // Try DOM detection
  const fromDom = findUsernameFromDom();
  if (fromDom) {
    stored.lichess = { username: fromDom, source: "auto" };
    await chrome.storage.local.set({ [USERNAMES_KEY]: stored });
    console.log(LOG, "Auto-detected username:", fromDom);
    return fromDom;
  }

  // Fall back to existing auto-detected value
  return entry?.username ?? null;
}
