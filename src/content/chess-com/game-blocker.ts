import { ChessEvent } from "../../types";
import { STORAGE_KEY } from "../../constants";
import { BlockingState, computeBlockingState } from "../shared/blocking-logic";
import { showBlockingModal } from "../shared/blocking-modal";

const LOG = "[CTG GameBlocker]";

/** CSS selectors for chess.com play/seek buttons. */
const PLAY_SELECTORS = [
  '[data-cy="new-game-index-play"]',
  '[data-cy^="time-selector-category-"]',
  '[data-cy="sidebar-game-over-new-game-button"]',
  '[data-cy="sidebar-game-over-rematch-button"]',
  ".play-quick-links-link",
  ".new-game-buttons-component button",
  ".game-over-buttons-component button",
  ".game-over-buttons-component a",
  ".board-modal-container button",
];

/** Text patterns matched against a button's own (direct) text content. */
const PLAY_TEXT_PATTERNS = /\b(play|new\s+game|rematch)\b/i;

/** Elements eligible for text-based matching. */
const TEXT_MATCH_TAGS = ["BUTTON", "A"];

/**
 * Returns the element's own direct text (ignoring child element text).
 */
function getDirectText(el: Element): string {
  let text = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    }
  }
  return text.trim();
}

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
      if (PLAY_TEXT_PATTERNS.test(getDirectText(el))) return true;
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

export function initChessComGameBlocker(): void {
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
    if (isPlayElement(e.target)) {
      if (!cachedState.blocked) return; // allow click

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showBlockingModal(cachedState, "chess.com");
    }
  };

  document.addEventListener("click", clickHandler, { capture: true });

  initialized = true;
  console.log(LOG, "Chess.com game blocker initialized");
}

function teardown(): void {
  if (clickHandler) {
    document.removeEventListener("click", clickHandler, { capture: true });
    clickHandler = null;
  }
  initialized = false;
}
