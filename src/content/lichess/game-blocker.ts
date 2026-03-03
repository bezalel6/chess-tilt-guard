import { ChessEvent, UserSettings } from "../../types";
import {
  STORAGE_KEY,
  SETTINGS_KEY,
  DEFAULT_LOSS_STREAK_THRESHOLD,
  DEFAULT_PUZZLE_WINS_TO_UNBLOCK,
} from "../../constants";
import { BlockingState, computeBlockingState } from "../shared/blocking-logic";
import { showBlockingModal } from "../shared/blocking-modal";

const LOG = "[CTG GameBlocker]";

/** CSS selectors for lichess play/seek buttons. */
const PLAY_SELECTORS = [
  ".lobby__app [data-id]",
  ".lobby__table button",
  ".lobby__start button",
  'a[href*="/setup/hook"]',
  ".follow-up a",
  ".follow-up button",
  ".rcontrols a",
  ".rcontrols button",
];

/** Text patterns matched against a button/link's full text content. */
const PLAY_TEXT_PATTERNS = /\b(new\s+opponent|rematch)\b/i;

/** Elements eligible for text-based matching. */
const TEXT_MATCH_TAGS = ["BUTTON", "A"];

/**
 * Walk from `target` up through ancestors, checking if any element
 * matches a play/seek selector or text pattern.
 */
function isPlayElement(target: EventTarget | null): boolean {
  let el = target as Element | null;
  while (el && el !== document.documentElement) {
    for (const sel of PLAY_SELECTORS) {
      if (el.matches(sel)) return true;
    }
    if (TEXT_MATCH_TAGS.includes(el.tagName)) {
      const text = (el.textContent ?? "").trim();
      if (PLAY_TEXT_PATTERNS.test(text)) return true;
    }
    el = el.parentElement;
  }
  return false;
}

// ── State ──────────────────────────────────────────────────────────────

let initialized = false;
let clickHandler: ((e: MouseEvent) => void) | null = null;
let cachedState: BlockingState = {
  blocked: false,
  consecutiveLosses: 0,
  puzzleWinsAfterStreak: 0,
  puzzleWinsNeeded: 0,
  puzzleWinsRequired: DEFAULT_PUZZLE_WINS_TO_UNBLOCK,
};
let cachedLossThreshold = DEFAULT_LOSS_STREAK_THRESHOLD;
let cachedPuzzleWins = DEFAULT_PUZZLE_WINS_TO_UNBLOCK;

function recompute(events: ChessEvent[]): void {
  cachedState = computeBlockingState(events, cachedLossThreshold, cachedPuzzleWins);
  console.log(LOG, "Blocking state updated:", cachedState);
}

// ── Public API ─────────────────────────────────────────────────────────

export function initLichessGameBlocker(): void {
  if (initialized) {
    teardown();
  }

  // Load initial state (events + settings)
  chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], (data) => {
    const settings: UserSettings | undefined = data[SETTINGS_KEY];
    if (settings) {
      cachedLossThreshold = settings.lossStreakThreshold;
      cachedPuzzleWins = settings.puzzleWinsToUnblock;
    }
    recompute(data[STORAGE_KEY] ?? []);
  });

  // Keep a reference to the latest events for recomputation on settings change
  let latestEvents: ChessEvent[] = [];

  // Listen for storage changes to keep state fresh
  chrome.storage.onChanged.addListener((changes) => {
    let needsRecompute = false;

    if (changes[STORAGE_KEY]) {
      latestEvents = changes[STORAGE_KEY].newValue ?? [];
      needsRecompute = true;
    }
    if (changes[SETTINGS_KEY]) {
      const settings: UserSettings | undefined = changes[SETTINGS_KEY].newValue;
      if (settings) {
        cachedLossThreshold = settings.lossStreakThreshold;
        cachedPuzzleWins = settings.puzzleWinsToUnblock;
      }
      needsRecompute = true;
    }

    if (needsRecompute) recompute(latestEvents);
  });

  clickHandler = (e: MouseEvent) => {
    // Never block on puzzle pages — blocking is supposed to redirect users TO puzzles
    const path = location.pathname;
    if (path.startsWith("/training") || path.startsWith("/streak") || path.startsWith("/storm")) return;

    if (isPlayElement(e.target)) {
      if (!cachedState.blocked) return; // allow click

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showBlockingModal(cachedState, "lichess");
    }
  };

  document.addEventListener("click", clickHandler, { capture: true });

  initialized = true;
  console.log(LOG, "Lichess game blocker initialized");
}

function teardown(): void {
  if (clickHandler) {
    document.removeEventListener("click", clickHandler, { capture: true });
    clickHandler = null;
  }
  initialized = false;
}
