import { sendChessEvent, generateEventId } from "../shared/messaging";

const LOG = "[CTG PuzzleRushDetector]";

let observing = false;
let lastEmittedTimestamp = 0;

/** Minimum interval between rush events to prevent duplicates (ms). */
const DEBOUNCE_MS = 5000;

export function initChessComPuzzleRushDetector(): void {
  if (!location.pathname.startsWith("/puzzles/rush")) return;
  if (observing) return;
  observing = true;

  console.log(LOG, "Observing puzzle rush game-over on", location.pathname);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const modal = node.matches?.('[data-cy="modalRushOver"]')
          ? node
          : node.querySelector?.('[data-cy="modalRushOver"]');

        if (modal) {
          handleRushGameOver(modal as HTMLElement);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function handleRushGameOver(modal: HTMLElement): void {
  const now = Date.now();
  if (now - lastEmittedTimestamp < DEBOUNCE_MS) {
    console.log(LOG, "Debounced — too soon after last emission");
    return;
  }

  const scoreEl = modal.querySelector('[data-cy="puzzles-modals-score"]');
  if (!scoreEl) {
    console.warn(LOG, "Game-over modal found but no score element");
    return;
  }

  const scoreText = (scoreEl.textContent ?? "").trim();
  const score = parseInt(scoreText, 10);

  if (isNaN(score) || score < 0) {
    console.warn(LOG, "Could not parse rush score:", scoreText);
    return;
  }

  lastEmittedTimestamp = now;

  console.log(LOG, "Puzzle Rush completed, score:", score);

  sendChessEvent({
    id: generateEventId("chess.com", "puzzle_rush"),
    type: "puzzle_rush",
    result: "win",
    platform: "chess.com",
    timestamp: now,
    url: location.href,
    details: {
      detectionMethod: "dom-rush-gameover",
      matchedSelector: '[data-cy="modalRushOver"]',
      extra: { score },
    },
  });
}
