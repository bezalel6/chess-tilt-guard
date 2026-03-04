import { Platform, ChessComApiGame, ChessEvent } from "../types";
import { mergeEvents } from "../storage";
import {
  LAST_SYNC_KEY,
  MAX_STACK_SIZE_KEY,
  DEFAULT_MAX_STACK_SIZE,
} from "../constants";
import { fetchLichessGames, lichessGameToEvent } from "./lichess-api";
import { extractFenFromPgn } from "./fen-utils";

const LOG = "[CTG Sync]";

/** Minimum milliseconds between syncs per platform. */
const SYNC_COOLDOWN: Record<Platform, number> = {
  "chess.com": 60_000,
  lichess: 30_000,
};

/** Backoff duration on 429 rate-limit responses. */
const RATE_LIMIT_BACKOFF_MS = 60_000;

interface SyncTimestamps {
  "chess.com"?: number;
  lichess?: number;
}

/** In-memory backoff tracker — resets on service worker restart (acceptable). */
const backoffUntil: Record<string, number> = {};

/** In-memory ETag cache for chess.com monthly endpoints. Keyed by URL. */
const etagCache: Record<string, string> = {};

async function getLastSyncTimestamps(): Promise<SyncTimestamps> {
  const data = await chrome.storage.local.get(LAST_SYNC_KEY);
  return data[LAST_SYNC_KEY] ?? {};
}

async function setLastSyncTimestamp(platform: Platform): Promise<void> {
  const timestamps = await getLastSyncTimestamps();
  timestamps[platform] = Date.now();
  await chrome.storage.local.set({ [LAST_SYNC_KEY]: timestamps });
}

function isOnCooldown(platform: Platform, timestamps: SyncTimestamps): boolean {
  const lastSync = timestamps[platform] ?? 0;
  return Date.now() - lastSync < SYNC_COOLDOWN[platform];
}

function isBackedOff(platform: Platform): boolean {
  return Date.now() < (backoffUntil[platform] ?? 0);
}

async function getMaxSize(): Promise<number> {
  const data = await chrome.storage.local.get(MAX_STACK_SIZE_KEY);
  return data[MAX_STACK_SIZE_KEY] ?? DEFAULT_MAX_STACK_SIZE;
}

// ── Chess.com sync ──────────────────────────────────────────────────

/**
 * Fetch games for the given month from the chess.com public API.
 * Reused from existing background logic, extracted here for sync.
 */
async function fetchChessComMonthlyGames(
  username: string,
  year: number,
  month: number
): Promise<ChessComApiGame[] | null> {
  const mm = String(month).padStart(2, "0");
  const url = `https://api.chess.com/pub/player/${username}/games/${year}/${mm}`;
  console.log(LOG, "Chess.com fetch:", url);

  try {
    const headers: Record<string, string> = {
      "User-Agent": "ChessTiltGuard/0.1.0",
    };
    if (etagCache[url]) {
      headers["If-None-Match"] = etagCache[url];
    }

    const res = await fetch(url, { headers });

    if (res.status === 304) {
      console.log(LOG, "Chess.com 304 Not Modified:", url);
      return null;
    }
    if (res.status === 429) {
      console.warn(LOG, "Chess.com rate limited, backing off");
      backoffUntil["chess.com"] = Date.now() + RATE_LIMIT_BACKOFF_MS;
      return null;
    }
    if (!res.ok) {
      console.warn(LOG, "Chess.com API returned", res.status);
      return null;
    }

    // Store ETag for future conditional requests
    const etag = res.headers.get("etag");
    if (etag) etagCache[url] = etag;

    const data = await res.json();
    return data.games ?? null;
  } catch (err) {
    console.error(LOG, "Chess.com fetch failed:", err);
    return null;
  }
}

function chessComGameToEvent(
  game: ChessComApiGame,
  username: string
): ChessEvent | null {
  const lowerUser = username.toLowerCase();
  const isWhite = game.white.username.toLowerCase() === lowerUser;
  const isBlack = game.black.username.toLowerCase() === lowerUser;
  if (!isWhite && !isBlack) return null;

  const player = isWhite ? game.white : game.black;
  const playerColor = isWhite ? "white" : "black";

  const WIN_RESULTS = new Set(["win"]);
  const DRAW_RESULTS = new Set([
    "agreed",
    "stalemate",
    "repetition",
    "insufficient",
    "50move",
    "timevsinsufficient",
  ]);
  const ABORT_RESULTS = new Set(["abandoned", "aborted"]);

  // Skip aborted/abandoned games entirely
  if (
    ABORT_RESULTS.has(game.white.result) ||
    ABORT_RESULTS.has(game.black.result)
  ) {
    return null;
  }

  let result: "win" | "loss" | "draw";
  if (WIN_RESULTS.has(player.result)) result = "win";
  else if (DRAW_RESULTS.has(player.result)) result = "draw";
  else result = "loss";

  const descriptive =
    game.white.result === "win" ? game.black.result : game.white.result;

  const fen = game.pgn ? extractFenFromPgn(game.pgn) : null;

  return {
    id: `chesscom-game-${game.url}`,
    type: "game",
    result,
    platform: "chess.com",
    timestamp: game.end_time * 1000,
    url: game.url,
    details: {
      detectionMethod: "chess-com-api-sync",
      playerColor,
      endReason: descriptive,
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

async function syncChessCom(username: string): Promise<void> {
  const maxSize = await getMaxSize();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const games = await fetchChessComMonthlyGames(username, year, month);
  if (!games) return;

  // Also fetch previous month if within first 3 days
  let allGames = [...games];
  if (now.getDate() <= 3) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevGames = await fetchChessComMonthlyGames(
      username,
      prevYear,
      prevMonth
    );
    if (prevGames) allGames = [...allGames, ...prevGames];
  }

  // Sort newest first and take only up to max stack size
  allGames.sort((a, b) => b.end_time - a.end_time);
  const limited = allGames.slice(0, maxSize);

  // Convert to events
  const events: ChessEvent[] = [];
  for (const game of limited) {
    const event = chessComGameToEvent(game, username);
    if (event) events.push(event);
  }

  // Single batch merge — one storage write, no flicker
  await mergeEvents(events);
  console.log(
    LOG,
    `Chess.com sync: ${limited.length} games processed, ${events.length} converted`
  );
}

// ── Lichess sync ────────────────────────────────────────────────────

async function syncLichess(username: string): Promise<void> {
  const maxSize = await getMaxSize();
  const games = await fetchLichessGames(username, maxSize);

  if (games.length === 0) return;

  // Convert to events
  const events: ChessEvent[] = [];
  for (const game of games) {
    const event = lichessGameToEvent(game, username);
    if (event) events.push(event);
  }

  // Single batch merge — one storage write, no flicker
  await mergeEvents(events);
  console.log(
    LOG,
    `Lichess sync: ${games.length} games fetched, ${events.length} converted`
  );
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Sync recent games for the given platform.
 * Respects per-platform cooldowns and rate-limit backoff.
 * Called by the background message handler when a content script requests sync.
 */
export async function syncPlatform(
  platform: Platform,
  username: string
): Promise<void> {
  if (isBackedOff(platform)) {
    console.log(LOG, `${platform} is backed off, skipping sync`);
    return;
  }

  const timestamps = await getLastSyncTimestamps();
  if (isOnCooldown(platform, timestamps)) {
    console.log(LOG, `${platform} sync on cooldown, skipping`);
    return;
  }

  console.log(LOG, `Syncing ${platform} for user: ${username}`);

  try {
    if (platform === "chess.com") {
      await syncChessCom(username);
    } else {
      await syncLichess(username);
    }
    await setLastSyncTimestamp(platform);
  } catch (err) {
    console.error(LOG, `${platform} sync error:`, err);
  }
}
