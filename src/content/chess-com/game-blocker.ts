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
    // Selector match
    for (const sel of PLAY_SELECTORS) {
      if (el.matches(sel)) return true;
    }
    // Text match (only on button/link elements)
    if (TEXT_MATCH_TAGS.includes(el.tagName)) {
      if (PLAY_TEXT_PATTERNS.test(getDirectText(el))) return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Apply a visual "blocked" style to play buttons currently in the DOM.
 */
function markBlockedButtons(): void {
  for (const sel of PLAY_SELECTORS) {
    document.querySelectorAll(sel).forEach((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.opacity = "0.5";
      htmlEl.style.cursor = "not-allowed";
    });
  }
}

// ── State ──────────────────────────────────────────────────────────────

let initialized = false;
let clickHandler: ((e: MouseEvent) => void) | null = null;
let observer: MutationObserver | null = null;

// ── Public API ─────────────────────────────────────────────────────────

export function initChessComGameBlocker(): void {
  // Guard against double-init: tear down previous listener/observer first
  if (initialized) {
    teardown();
  }

  clickHandler = (e: MouseEvent) => {
    if (isPlayElement(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log(LOG, "Blocked game-seeking click", e.target);
      alert("You shall not pass!");
    }
  };

  document.addEventListener("click", clickHandler, { capture: true });

  // Observe DOM for newly-inserted play buttons and dim them
  observer = new MutationObserver(() => markBlockedButtons());
  observer.observe(document.body, { childList: true, subtree: true });

  // Mark any buttons already present
  markBlockedButtons();

  initialized = true;
  console.log(LOG, "Chess.com game blocker initialized");
}

function teardown(): void {
  if (clickHandler) {
    document.removeEventListener("click", clickHandler, { capture: true });
    clickHandler = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  initialized = false;
}
