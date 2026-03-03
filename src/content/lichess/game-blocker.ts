import { ChessEvent } from "../../types";
import { STORAGE_KEY } from "../../constants";
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
};

function updateBlockingState(events: ChessEvent[]): void {
  cachedState = computeBlockingState(events);
  console.log(LOG, "Blocking state updated:", cachedState);
}

// ── Public API ─────────────────────────────────────────────────────────

export function initLichessGameBlocker(): void {
  if (initialized) {
    teardown();
  }

  // Load initial state
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    updateBlockingState(data[STORAGE_KEY] ?? []);
  });

  // Listen for storage changes to keep state fresh
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) {
      updateBlockingState(changes[STORAGE_KEY].newValue ?? []);
    }
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
