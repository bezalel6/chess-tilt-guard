import {
  BackgroundMessage,
  ChessComApiGame,
  ChessComApiPlayer,
  ChessEvent,
  EventResult,
  PlayerColor,
} from "./types";
import { addEvent } from "./storage";
import {
  PENDING_GAMES_KEY,
  STORAGE_KEY,
  USERNAMES_KEY,
  CACHED_USERNAME_KEY,
  CACHED_LICHESS_USERNAME_KEY,
  SETTINGS_KEY,
  DEFAULT_LOSS_STREAK_THRESHOLD,
} from "./constants";
import type { PendingGame, StoredUsernames } from "./types";
import { computeStreakInfo } from "./content/shared/blocking-logic";
import { syncPlatform } from "./background/api-sync";
import { extractFenFromPgn } from "./background/fen-utils";

const LOG = "[CTG Background]";

/** All chess.com API result strings that mean the player won. */
const WIN_RESULTS = new Set(["win"]);

/** All chess.com API result strings that mean a draw. */
const DRAW_RESULTS = new Set([
  "agreed",
  "stalemate",
  "repetition",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

/** Chess.com API result strings for games that should be skipped entirely. */
const ABORT_RESULTS = new Set(["abandoned", "aborted"]);

/** Map chess.com API result strings to human-readable end reasons. */
const END_REASON_MAP: Record<string, string> = {
  win: "Win",
  checkmated: "Checkmate",
  timeout: "Timeout",
  resigned: "Resignation",
  abandoned: "Abandoned",
  agreed: "Draw by agreement",
  stalemate: "Stalemate",
  repetition: "Threefold repetition",
  insufficient: "Insufficient material",
  "50move": "Fifty-move rule",
  timevsinsufficient: "Timeout vs insufficient material",
};

function classifyResult(apiResult: string): EventResult {
  if (WIN_RESULTS.has(apiResult)) return "win";
  if (DRAW_RESULTS.has(apiResult)) return "draw";
  return "loss";
}

function toEndReason(whiteResult: string, blackResult: string): string {
  // The non-"win" result is more descriptive (e.g. "checkmated", "timeout")
  const descriptive = whiteResult === "win" ? blackResult : whiteResult;
  return END_REASON_MAP[descriptive] ?? descriptive;
}

function gameToEvent(
  game: ChessComApiGame,
  username: string
): ChessEvent | null {
  const lowerUser = username.toLowerCase();
  const isWhite = game.white.username.toLowerCase() === lowerUser;
  const isBlack = game.black.username.toLowerCase() === lowerUser;

  if (!isWhite && !isBlack) return null; // spectator or wrong user

  const player: ChessComApiPlayer = isWhite ? game.white : game.black;

  // Skip aborted/abandoned games entirely
  if (
    ABORT_RESULTS.has(game.white.result) ||
    ABORT_RESULTS.has(game.black.result)
  ) {
    return null;
  }

  const playerColor: PlayerColor = isWhite ? "white" : "black";
  const result = classifyResult(player.result);
  const endReason = toEndReason(game.white.result, game.black.result);

  const fen = game.pgn ? extractFenFromPgn(game.pgn) : null;

  return {
    id: `chesscom-game-${game.url}`,
    type: "game",
    result,
    platform: "chess.com",
    timestamp: game.end_time * 1000, // API uses seconds, we use ms
    url: game.url,
    details: {
      detectionMethod: "chess-com-api",
      playerColor,
      endReason,
      rawResult: player.result,
      fen: fen ?? undefined,
      extra: {
        timeClass: game.time_class,
        timeControl: game.time_control,
        rated: game.rated,
        playerRating: player.rating,
        opponentRating: isWhite ? game.black.rating : game.white.rating,
        opponentUsername: isWhite ? game.black.username : game.white.username,
      },
    },
  };
}

/**
 * Fetch games for the given month from the chess.com public API.
 * Returns the raw array or null on failure.
 */
async function fetchMonthlyGames(
  username: string,
  year: number,
  month: number
): Promise<ChessComApiGame[] | null> {
  const mm = String(month).padStart(2, "0");
  const url = `https://api.chess.com/pub/player/${username}/games/${year}/${mm}`;
  console.log(LOG, "Fetching:", url);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ChessTiltGuard/0.1.0",
      },
    });
    if (!res.ok) {
      console.warn(LOG, "API returned", res.status, "for", url);
      return null;
    }
    const data = await res.json();
    return data.games ?? null;
  } catch (err) {
    console.error(LOG, "Fetch failed:", err);
    return null;
  }
}

/**
 * Extract the numeric game ID from a chess.com game URL.
 * Handles both "/game/live/123" (API format) and "/game/123" (page URL format).
 */
function extractGameId(url: string): string | null {
  const match = url.match(/\/game\/(?:(?:live|daily)\/)?(\d+)/);
  return match ? match[1] : null;
}

async function checkPendingGames(username: string): Promise<void> {
  const data = await chrome.storage.local.get([PENDING_GAMES_KEY, STORAGE_KEY]);
  const pending: PendingGame[] = data[PENDING_GAMES_KEY] ?? [];
  const existingEvents: ChessEvent[] = data[STORAGE_KEY] ?? [];

  if (pending.length === 0) return;

  // Build a set of already-resolved game IDs
  const resolvedIds = new Set(
    existingEvents
      .filter((e) => e.platform === "chess.com" && e.type === "game")
      .map((e) => extractGameId(e.url))
      .filter(Boolean)
  );

  // Filter out already-resolved pending games
  const unresolvedPending = pending.filter((g) => {
    const id = extractGameId(g.gameUrl);
    return id ? !resolvedIds.has(id) : false;
  });

  if (unresolvedPending.length === 0) {
    await chrome.storage.local.set({ [PENDING_GAMES_KEY]: [] });
    console.log(LOG, "All pending games already resolved");
    return;
  }

  // Determine which months to fetch (current + previous if needed)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  // Fetch current month
  let allGames = await fetchMonthlyGames(username, currentYear, currentMonth);
  if (!allGames) allGames = [];

  // Build a lookup by game ID
  const gameLookup = new Map<string, ChessComApiGame>();
  for (const g of allGames) {
    const id = extractGameId(g.url);
    if (id) gameLookup.set(id, g);
  }

  // Check which pending games are resolved
  const stillPending: PendingGame[] = [];
  const needPrevMonth: PendingGame[] = [];

  for (const pg of unresolvedPending) {
    const gameId = extractGameId(pg.gameUrl);
    const apiGame = gameId ? gameLookup.get(gameId) : undefined;

    if (apiGame) {
      const event = gameToEvent(apiGame, username);
      if (event) {
        await addEvent(event);
        console.log(LOG, "Resolved game:", event.url, "→", event.result);
      }
      // Resolved (or not our game), either way remove from pending
    } else {
      needPrevMonth.push(pg);
    }
  }

  // If some games weren't found, try previous month
  if (needPrevMonth.length > 0) {
    const prevGames = await fetchMonthlyGames(username, prevYear, prevMonth);
    if (prevGames) {
      for (const g of prevGames) {
        const id = extractGameId(g.url);
        if (id) gameLookup.set(id, g);
      }
    }

    for (const pg of needPrevMonth) {
      const gameId = extractGameId(pg.gameUrl);
      const apiGame = gameId ? gameLookup.get(gameId) : undefined;

      if (apiGame) {
        const event = gameToEvent(apiGame, username);
        if (event) {
          await addEvent(event);
          console.log(
            LOG,
            "Resolved game (prev month):",
            event.url,
            "→",
            event.result
          );
        }
      } else {
        // Game not in API yet (maybe still in progress or too recent)
        stillPending.push(pg);
      }
    }
  }

  await chrome.storage.local.set({ [PENDING_GAMES_KEY]: stillPending });
  console.log(
    LOG,
    `Done: ${unresolvedPending.length - stillPending.length} resolved, ${
      stillPending.length
    } still pending`
  );
}

// ── Username migration ────────────────────────────────────────────────

/**
 * Migrate old per-platform cached username keys into the unified USERNAMES_KEY.
 * Idempotent — safe to run on every startup.
 */
async function migrateUsernames(): Promise<void> {
  const data = await chrome.storage.local.get([
    USERNAMES_KEY,
    CACHED_USERNAME_KEY,
    CACHED_LICHESS_USERNAME_KEY,
  ]);

  const existing: StoredUsernames = data[USERNAMES_KEY] ?? {};
  let changed = false;

  const oldChessCom: string | undefined = data[CACHED_USERNAME_KEY];
  if (oldChessCom && !existing["chess.com"]) {
    existing["chess.com"] = { username: oldChessCom, source: "auto" };
    changed = true;
  }

  const oldLichess: string | undefined = data[CACHED_LICHESS_USERNAME_KEY];
  if (oldLichess && !existing.lichess) {
    existing.lichess = { username: oldLichess, source: "auto" };
    changed = true;
  }

  // Handle legacy flat-string format: { "chess.com": "user" } → { "chess.com": { username: "user", source: "auto" } }
  for (const key of ["chess.com", "lichess"] as const) {
    const val = existing[key];
    if (val && typeof val === "string") {
      (existing as Record<string, unknown>)[key] = { username: val, source: "auto" };
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ [USERNAMES_KEY]: existing });
    console.log(LOG, "Migrated usernames:", existing);
  }

  // Remove old keys regardless (cleanup)
  await chrome.storage.local.remove([
    CACHED_USERNAME_KEY,
    CACHED_LICHESS_USERNAME_KEY,
  ]);
}

migrateUsernames();

// ── Message listener ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: BackgroundMessage, _sender, sendResponse) => {
    if (message.kind === "CHESS_EVENT") {
      addEvent(message.payload)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error(LOG, "Failed to store event:", err);
          sendResponse({ success: false });
        });
      return true;
    }

    if (message.kind === "CHECK_PENDING_GAMES") {
      checkPendingGames(message.username)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error(LOG, "Failed to check pending games:", err);
          sendResponse({ success: false });
        });
      return true;
    }

    if (message.kind === "SYNC_GAMES") {
      syncPlatform(message.platform, message.username)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error(LOG, "Failed to sync games:", err);
          sendResponse({ success: false });
        });
      return true;
    }
  }
);

// ── Badge updates ────────────────────────────────────────────────────

let cachedLossThreshold = DEFAULT_LOSS_STREAK_THRESHOLD;

function updateBadge(events: ChessEvent[]): void {
  const { consecutiveLosses, consecutiveWins } = computeStreakInfo(events);

  if (consecutiveLosses >= cachedLossThreshold) {
    // Tilted — red badge with loss count
    chrome.action.setBadgeText({ text: String(consecutiveLosses) });
    chrome.action.setBadgeBackgroundColor({ color: "#F44336" });
  } else if (consecutiveLosses >= 1) {
    // Approaching threshold — orange warning
    chrome.action.setBadgeText({ text: String(consecutiveLosses) });
    chrome.action.setBadgeBackgroundColor({ color: "#FF9800" });
  } else if (consecutiveWins >= 2) {
    // Win streak — green badge
    chrome.action.setBadgeText({ text: `W${consecutiveWins}` });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
  } else {
    // Neutral — clear badge
    chrome.action.setBadgeText({ text: "" });
  }
}

// Load initial state (events + settings)
chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], (data) => {
  const settings = data[SETTINGS_KEY];
  if (settings?.lossStreakThreshold) {
    cachedLossThreshold = settings.lossStreakThreshold;
  }
  updateBadge(data[STORAGE_KEY] ?? []);
});

// Single storage listener for events + settings changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes[SETTINGS_KEY]) {
    const settings = changes[SETTINGS_KEY].newValue;
    if (settings?.lossStreakThreshold) {
      cachedLossThreshold = settings.lossStreakThreshold;
    }
  }
  if (changes[STORAGE_KEY] || changes[SETTINGS_KEY]) {
    // Re-read current events if settings changed but events didn't
    if (changes[STORAGE_KEY]) {
      updateBadge(changes[STORAGE_KEY].newValue ?? []);
    } else {
      chrome.storage.local.get(STORAGE_KEY, (data) => {
        updateBadge(data[STORAGE_KEY] ?? []);
      });
    }
  }
});

console.log(LOG, "Service worker loaded");
