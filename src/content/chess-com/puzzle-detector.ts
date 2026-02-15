import { sendChessEvent, generateEventId } from "../shared/messaging";
import { EventResult } from "../../types";

const seenPuzzles = new Set<string>();
let observing = false;

/** Known red fill colors used in chess.com failure SVG icons. */
const FAILURE_COLORS = ["#ff7769", "#f44336", "#e74c3c", "#ff5252", "#e57373"];
/** Known green fill colors used in chess.com success SVG icons. */
const SUCCESS_COLORS = ["#81c784", "#4caf50", "#66bb6a", "#27ae60", "#69c97c"];

export function initChessComPuzzleDetector(): void {
  if (!location.pathname.startsWith("/puzzles")) return;
  if (observing) return;
  observing = true;

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

  const hasFailureColor = FAILURE_COLORS.some((c) =>
    html.includes(c.toLowerCase())
  );
  const hasSuccessColor = SUCCESS_COLORS.some((c) =>
    html.includes(c.toLowerCase())
  );

  if (hasSuccessColor && !hasFailureColor) return "win";
  if (hasFailureColor && !hasSuccessColor) return "loss";

  return null;
}

/**
 * Fallback: determine puzzle result from text content, using specific phrases
 * rather than single keywords to avoid false matches like "not the best".
 */
function detectResultFromText(el: HTMLElement): EventResult | null {
  const text = (el.textContent ?? "").toLowerCase();

  // Check for clear failure phrases first (they might also contain success words)
  const failurePhrases = [
    "not right",
    "incorrect",
    "wrong",
    "try again",
    "not the best",
  ];
  if (failurePhrases.some((phrase) => text.includes(phrase))) return "loss";

  // Check for clear success phrases
  const successPhrases = [
    "correct",
    "excellent",
    "solved",
    "nice move",
    "great",
  ];
  if (successPhrases.some((phrase) => text.includes(phrase))) return "win";

  return null;
}

function handlePuzzleResult(el: HTMLElement): void {
  // Skip the initial "Black/White to move" indicator
  if (isColorToMovePrompt(el)) return;

  // Try color-based detection first (most reliable)
  let result = detectResultFromColors(el);
  let detectionDetail = result !== null ? "svg-fill-color" : "";

  // Fall back to text-based detection
  if (result === null) {
    result = detectResultFromText(el);
    detectionDetail = result !== null ? "text-phrase-match" : "";
  }

  // If we can't determine the result, skip — don't log ambiguous detections
  if (result === null) return;

  const dedupKey = `puzzle-${Math.floor(Date.now() / 3000)}`;
  if (seenPuzzles.has(dedupKey)) return;
  seenPuzzles.add(dedupKey);

  // Extract puzzle ID from URL
  const urlParts = location.pathname.split("/");
  const lastSegment = urlParts[urlParts.length - 1];
  const puzzleId = /^\d+$/.test(lastSegment) ? lastSegment : undefined;

  // Capture raw data for debugging
  const text = (el.textContent ?? "").trim().substring(0, 80);
  const svgColorsSample = el.innerHTML
    .match(/fill:[#\w]+/gi)
    ?.slice(0, 5)
    .join(", ");

  sendChessEvent({
    id: generateEventId("chess.com", "puzzle"),
    type: "puzzle",
    result,
    platform: "chess.com",
    timestamp: Date.now(),
    url: location.href,
    details: {
      detectionMethod: `dom-coach-feedback (${detectionDetail})`,
      matchedSelector: ".cc-coach-feedback-detail-component",
      puzzleId,
      extra: {
        feedbackText: text,
        svgFillColors: svgColorsSample ?? "none",
      },
    },
  });
}
