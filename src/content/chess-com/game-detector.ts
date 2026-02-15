import { PendingGame } from "../../types";
import {
  PENDING_GAMES_KEY,
  CACHED_USERNAME_KEY,
  STORAGE_KEY,
  MAX_PENDING_AGE_MS,
} from "../../constants";

const LOG = "[CTG GameDetector]";

/** URL patterns for chess.com game pages. Matches /game/123, /game/live/123, /game/daily/123 */
const GAME_URL_RE =
  /^https?:\/\/(www\.)?chess\.com\/game\/(?:(?:live|daily)\/)?(\d+)/;

/**
 * Selectors to find the logged-in user's username on the page.
 * On a game page the "bottom" player area always belongs to the current user.
 * We try several selectors in priority order because chess.com periodically
 * renames its component class names.
 */
const USERNAME_SELECTORS = [
  // Bottom player area username (most reliable on game pages)
  "#board-layout-player-bottom .user-tagline-username",
  '#board-layout-player-bottom a[data-test-element="user-tagline-username"]',
  "#board-layout-player-bottom cc-user-username-component",
  "#board-layout-player-bottom .user-tagline-compact-username",
  // Generic navigation profile link (works on any page)
  'a[href^="/member/"]',
];

// ── Username detection ────────────────────────────────────────────────

function findUsernameFromDom(): string | null {
  for (const sel of USERNAME_SELECTORS) {
    const el = document.querySelector(sel);
    if (!el) continue;

    // For <a href="/member/xxx"> links, parse from href
    if (sel.includes("/member/")) {
      const href = el.getAttribute("href");
      const match = href?.match(/\/member\/([^/?#]+)/);
      if (match) return match[1].toLowerCase();
      continue;
    }

    const text = el.textContent?.trim();
    if (text) return text.toLowerCase();
  }
  return null;
}

async function getCachedUsername(): Promise<string | null> {
  const data = await chrome.storage.local.get(CACHED_USERNAME_KEY);
  return data[CACHED_USERNAME_KEY] ?? null;
}

async function cacheUsername(username: string): Promise<void> {
  await chrome.storage.local.set({ [CACHED_USERNAME_KEY]: username });
}

/**
 * Try to find the username, first from DOM then from cache.
 * If found in DOM, update the cache.
 */
async function resolveUsername(): Promise<string | null> {
  const fromDom = findUsernameFromDom();
  if (fromDom) {
    await cacheUsername(fromDom);
    return fromDom;
  }
  return getCachedUsername();
}

// ── Pending games storage ─────────────────────────────────────────────

async function getPendingGames(): Promise<PendingGame[]> {
  const data = await chrome.storage.local.get(PENDING_GAMES_KEY);
  return data[PENDING_GAMES_KEY] ?? [];
}

async function setPendingGames(games: PendingGame[]): Promise<void> {
  await chrome.storage.local.set({ [PENDING_GAMES_KEY]: games });
}

function extractGameId(url: string): string | null {
  const match = url.match(/\/game\/(?:(?:live|daily)\/)?(\d+)/);
  return match ? match[1] : null;
}

async function addPendingGame(gameUrl: string): Promise<void> {
  const pending = await getPendingGames();
  const gameId = extractGameId(gameUrl);
  if (!gameId) return;

  // Already pending?
  if (pending.some((g) => extractGameId(g.gameUrl) === gameId)) return;

  // Already resolved as an event?
  const eventsData = await chrome.storage.local.get(STORAGE_KEY);
  const events = eventsData[STORAGE_KEY] ?? [];
  if (events.some((e: { url: string }) => extractGameId(e.url) === gameId))
    return;

  pending.push({ gameUrl, seenAt: Date.now() });
  await setPendingGames(pending);
  console.log(LOG, "Added pending game:", gameUrl, "(id:", gameId, ")");
}

// ── Game page detection ───────────────────────────────────────────────

function getGameUrlFromPage(): string | null {
  const match = location.href.match(GAME_URL_RE);
  if (!match) return null;
  // Normalize to canonical URL using just the game ID
  return `https://www.chess.com/game/${match[2]}`;
}

// ── Initialization ───────────────────────────────────────────────────

/**
 * Detect if we're on a game page and register it.
 * Then trigger a check for any pending games via background.
 */
export function initChessComGameDetector(): void {
  console.log(LOG, "Initializing on", location.href);

  // Step 1: If on a game page, register it as pending
  const gameUrl = getGameUrlFromPage();
  if (gameUrl) {
    // Wait a moment for the DOM to populate player elements
    setTimeout(async () => {
      const username = await resolveUsername();
      if (username) {
        console.log(LOG, "Detected user:", username, "on game page:", gameUrl);
        await addPendingGame(gameUrl);
      } else {
        console.warn(LOG, "Could not find username on game page");
        // Still add the pending game — username might be cached or found later
        await addPendingGame(gameUrl);
      }
      // Trigger pending game check
      requestPendingCheck();
    }, 2000);
  } else {
    // Not a game page, but still check for pending games
    requestPendingCheck();
  }
}

async function requestPendingCheck(): Promise<void> {
  const username = await resolveUsername();
  if (!username) {
    console.log(LOG, "No username available, skipping pending check");
    return;
  }

  const pending = await getPendingGames();
  // Prune old entries
  const now = Date.now();
  const fresh = pending.filter((g) => now - g.seenAt < MAX_PENDING_AGE_MS);
  if (fresh.length !== pending.length) {
    await setPendingGames(fresh);
  }

  if (fresh.length === 0) {
    console.log(LOG, "No pending games to check");
    return;
  }

  console.log(
    LOG,
    "Checking",
    fresh.length,
    "pending game(s) for user:",
    username
  );
  chrome.runtime.sendMessage({ kind: "CHECK_PENDING_GAMES", username });
}
