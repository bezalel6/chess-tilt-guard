import { sendChessEvent, generateEventId } from "../shared/messaging";
import { watchNavigation } from "../shared/navigation";
import { EventResult } from "../../types";

const LOG = "[CTG PuzzleDetector]";

/** Known red fill colors used in chess.com failure SVG icons. */
const FAILURE_COLORS = ["#ff7769", "#f44336", "#e74c3c", "#ff5252", "#e57373"];
/** Known green fill colors used in chess.com success SVG icons. */
const SUCCESS_COLORS = ["#81c784", "#4caf50", "#66bb6a", "#27ae60", "#69c97c"];

/**
 * Per-puzzle state machine:
 * - IDLE: no feedback yet for this puzzle
 * - EMITTED_LOSS: failure detected and loss event sent — all further feedback ignored
 * - PENDING_WIN: success feedback seen, waiting for puzzle completion to confirm
 * - EMITTED_WIN: puzzle completed successfully and win event sent
 */
type PuzzlePhase = "idle" | "emitted_loss" | "pending_win" | "emitted_win";

interface PuzzleState {
  phase: PuzzlePhase;
  url: string;
}

/** Tracks state per puzzle ID. */
const puzzleStates = new Map<string, PuzzleState>();

/** The puzzle ID that was active before the most recent navigation. */
let previousPuzzleId: string | null = null;

/**
 * Session-based puzzle counter used when the URL doesn't contain a puzzle ID
 * (e.g. /puzzles/rated). Reset when a new "to move" prompt is detected.
 */
let sessionPuzzleCounter = 0;
let currentSessionPuzzleId: string | null = null;

let observing = false;
let navigationWatching = false;

/** Extract puzzle ID from the URL path: /puzzles/{id} or /puzzles/rated/{id}. */
function getPuzzleIdFromUrl(): string | null {
  const parts = location.pathname.split("/").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(parts[i])) return parts[i];
  }
  return null;
}

/**
 * Get the current puzzle's identifier. Prefers URL-based IDs, falls back
 * to a session-generated ID for pages like /puzzles/rated where the URL
 * stays constant across puzzles.
 */
function getCurrentPuzzleId(): string {
  const urlId = getPuzzleIdFromUrl();
  if (urlId) {
    console.log(LOG, "Puzzle ID from URL:", urlId);
    return urlId;
  }

  // Lazily create a session-based ID; reset by onNewPuzzleDetected()
  if (!currentSessionPuzzleId) {
    currentSessionPuzzleId = `session-${++sessionPuzzleCounter}`;
    console.log(LOG, "Created session puzzle ID:", currentSessionPuzzleId);
  }
  return currentSessionPuzzleId;
}

/** Called when a "to move" prompt signals that a new puzzle has loaded. */
function onNewPuzzleDetected(): void {
  console.log(LOG, "New puzzle detected (to-move trigger), previous session ID:", currentSessionPuzzleId);
  // Flush any pending win from the previous puzzle
  if (currentSessionPuzzleId) {
    flushPendingWin(currentSessionPuzzleId);
  }
  // Reset so the next getCurrentPuzzleId() call creates a fresh ID
  currentSessionPuzzleId = null;
}

function getOrCreateState(puzzleId: string): PuzzleState {
  let state = puzzleStates.get(puzzleId);
  if (!state) {
    state = { phase: "idle", url: location.href };
    puzzleStates.set(puzzleId, state);
  }
  return state;
}

/**
 * Flush a pending win for the given puzzle ID.
 * Called when the user navigates away or a new puzzle loads.
 */
function flushPendingWin(puzzleId: string): void {
  const state = puzzleStates.get(puzzleId);
  if (!state || state.phase !== "pending_win") return;

  console.log(LOG, `Flushing pending win for puzzle ${puzzleId}`);
  state.phase = "emitted_win";
  emitPuzzleEvent("win", puzzleId, state.url);
}

function emitPuzzleEvent(
  result: EventResult,
  puzzleId: string,
  url: string
): void {
  console.log(LOG, `Puzzle ${puzzleId}: ${result}`);
  sendChessEvent({
    id: generateEventId("chess.com", "puzzle"),
    type: "puzzle",
    result,
    platform: "chess.com",
    timestamp: Date.now(),
    url,
    details: {
      detectionMethod: "dom-coach-feedback",
      matchedSelector: ".cc-coach-feedback-detail-component",
      puzzleId,
    },
  });
}

export function initChessComPuzzleDetector(): void {
  if (!location.pathname.startsWith("/puzzles")) return;
  if (location.pathname.startsWith("/puzzles/rush")) return; // handled by puzzle-rush-detector
  if (observing) return;
  observing = true;

  console.log(LOG, "Observing puzzle feedback on", location.pathname);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const feedback = (
          node.matches?.(".cc-coach-feedback-detail-component")
            ? node
            : node.querySelector?.(".cc-coach-feedback-detail-component")
        ) as HTMLElement | null;

        if (feedback) {
          handlePuzzleResult(feedback);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Set up navigation watching for puzzle completion detection
  if (!navigationWatching) {
    navigationWatching = true;

    // Track the initial puzzle
    previousPuzzleId = getPuzzleIdFromUrl();

    watchNavigation(() => {
      const newPuzzleId = getPuzzleIdFromUrl();

      // If the previous puzzle had a pending win and we navigated away, flush it
      if (previousPuzzleId && previousPuzzleId !== newPuzzleId) {
        flushPendingWin(previousPuzzleId);
      }

      // Also flush any session-based pending win on URL change
      if (currentSessionPuzzleId) {
        flushPendingWin(currentSessionPuzzleId);
        currentSessionPuzzleId = null;
      }

      previousPuzzleId = newPuzzleId;

      // Re-init detector for new puzzle pages
      if (location.pathname.startsWith("/puzzles")) {
        observing = false;
        initChessComPuzzleDetector();
      }
    });

    // Flush pending win on page unload (last puzzle in session)
    window.addEventListener("beforeunload", () => {
      if (previousPuzzleId) {
        flushPendingWin(previousPuzzleId);
      }
      if (currentSessionPuzzleId) {
        flushPendingWin(currentSessionPuzzleId);
      }
    });
  }
}

function isColorToMovePrompt(el: HTMLElement): boolean {
  const text = (el.textContent ?? "").toLowerCase();
  return text.includes("to move");
}

/**
 * Determine puzzle result from the SVG icon fill colors inside the element.
 * Chess.com uses colored SVG icons: green for correct, red for incorrect.
 */
function detectResultFromColors(el: HTMLElement): EventResult | null {
  const html = el.innerHTML.toLowerCase();

  const matchedFailure = FAILURE_COLORS.filter((c) => html.includes(c.toLowerCase()));
  const matchedSuccess = SUCCESS_COLORS.filter((c) => html.includes(c.toLowerCase()));

  const hasFailureColor = matchedFailure.length > 0;
  const hasSuccessColor = matchedSuccess.length > 0;

  if (hasSuccessColor && !hasFailureColor) {
    console.log(LOG, "Color detection: SUCCESS, matched:", matchedSuccess);
    return "win";
  }
  if (hasFailureColor && !hasSuccessColor) {
    console.log(LOG, "Color detection: FAILURE, matched:", matchedFailure);
    return "loss";
  }

  console.log(LOG, "Color detection: indeterminate, success:", matchedSuccess, "failure:", matchedFailure);
  return null;
}

/**
 * Fallback: determine puzzle result from text content, using specific phrases
 * rather than single keywords to avoid false matches like "not the best".
 */
function detectResultFromText(el: HTMLElement): EventResult | null {
  const text = (el.textContent ?? "").toLowerCase();
  const snippet = text.slice(0, 80);

  const failurePhrases = [
    "not right",
    "incorrect",
    "wrong",
    "try again",
    "not the best",
  ];
  const matchedFailure = failurePhrases.filter((p) => text.includes(p));
  if (matchedFailure.length > 0) {
    console.log(LOG, `Text detection: FAILURE, matched: [${matchedFailure}], text: "${snippet}"`);
    return "loss";
  }

  const successPhrases = [
    "correct",
    "excellent",
    "solved",
    "nice move",
    "great",
  ];
  const matchedSuccess = successPhrases.filter((p) => text.includes(p));
  if (matchedSuccess.length > 0) {
    console.log(LOG, `Text detection: SUCCESS, matched: [${matchedSuccess}], text: "${snippet}"`);
    return "win";
  }

  console.log(LOG, `Text detection: no match, text: "${snippet}"`);
  return null;
}

function handlePuzzleResult(el: HTMLElement): void {
  // "Black/White to move" signals a new puzzle has loaded
  if (isColorToMovePrompt(el)) {
    onNewPuzzleDetected();
    return;
  }

  const puzzleId = getCurrentPuzzleId();

  // Try color-based detection first (most reliable)
  let result = detectResultFromColors(el);
  let method = "color";

  // Fall back to text-based detection
  if (result === null) {
    result = detectResultFromText(el);
    method = "text";
  }

  // If we can't determine the result, skip
  if (result === null) {
    console.log(LOG, `Puzzle ${puzzleId}: indeterminate result (both color and text returned null)`);
    return;
  }

  console.log(LOG, `Puzzle ${puzzleId}: detected ${result} via ${method}`);

  const state = getOrCreateState(puzzleId);
  const prevPhase = state.phase;

  // State machine transitions
  switch (state.phase) {
    case "idle":
      if (result === "loss") {
        // First failure → emit loss immediately
        state.phase = "emitted_loss";
        emitPuzzleEvent("loss", puzzleId, state.url);
      } else if (result === "win") {
        // Success feedback → might be intermediate move, wait for completion
        state.phase = "pending_win";
      }
      break;

    case "pending_win":
      if (result === "loss") {
        // Got success then failure → intermediate correct move then wrong move
        state.phase = "emitted_loss";
        emitPuzzleEvent("loss", puzzleId, state.url);
      }
      // Additional "win" feedback while pending → still waiting for completion
      break;

    case "emitted_loss":
    case "emitted_win":
      // Already emitted for this puzzle — ignore all further feedback (retries)
      break;
  }

  if (state.phase !== prevPhase) {
    console.log(LOG, `Puzzle ${puzzleId}: state ${prevPhase} → ${state.phase}`);
  }
}
