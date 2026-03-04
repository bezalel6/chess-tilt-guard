import { sendChessEvent, generateEventId } from "../shared/messaging";
import { EventResult } from "../../types";

const LOG = "[CTG LichessPuzzle]";

/** Puzzle IDs that have already been handled this session. */
const handledPuzzleIds = new Set<string>();
let observing = false;

function isPuzzlePage(): boolean {
  return (
    location.pathname.startsWith("/training") ||
    location.pathname.startsWith("/streak")
  );
}

/**
 * Extract puzzle result and ID from the session bar's `.current` entry.
 *
 * The session bar contains links like:
 *   <a class="result-false current" href="/training/mix/Cvya3">-16</a>
 *
 * The `.current` class marks the active puzzle, and `result-true` / `result-false`
 * tells us the outcome. The puzzle ID is the last segment of the href.
 */
function getResultFromSessionBar(): {
  puzzleId: string;
  result: EventResult;
} | null {
  const currentLink = document.querySelector(
    ".puzzle__session a.current"
  ) as HTMLAnchorElement | null;
  if (!currentLink) {
    console.log(LOG, "No .puzzle__session a.current found");
    return null;
  }

  // Determine result from class
  let result: EventResult;
  if (currentLink.classList.contains("result-true")) {
    result = "win";
  } else if (currentLink.classList.contains("result-false")) {
    result = "loss";
  } else {
    console.log(
      LOG,
      "Current session link has no result class:",
      Array.from(currentLink.classList).join(" ")
    );
    return null;
  }

  // Extract puzzle ID from href (last path segment)
  const href = currentLink.getAttribute("href") ?? "";
  const segments = href.split("/").filter(Boolean);
  const puzzleId = segments[segments.length - 1];

  // Guard against category slugs like "mix", "themes", etc.
  if (!puzzleId || ["training", "streak", "mix", "themes"].includes(puzzleId)) {
    console.log(LOG, "Session link href has no puzzle ID:", href);
    return null;
  }

  console.log(
    LOG,
    `Session bar .current: puzzle=${puzzleId}, result=${result}, href=${href}`
  );
  return { puzzleId, result };
}

/**
 * Fallback: detect result from the feedback panel content.
 * Used when the session bar doesn't have a usable `.current` entry.
 */
function getResultFromFeedback(): EventResult | null {
  const feedback = document.querySelector(".puzzle__feedback.after");
  if (!feedback) return null;

  // .complete = solved, .good = correct move (both mean win)
  const icon = feedback.querySelector(".complete, .good");
  const result: EventResult = icon ? "win" : "loss";
  console.log(
    LOG,
    `Feedback fallback: ${result} (found ${icon ? ".complete/.good" : "neither"})`
  );
  return result;
}

/**
 * Fallback: extract puzzle ID from the side panel metadata.
 * Looks for: <p>Puzzle <a href="/training/Cvya3">#Cvya3</a></p>
 */
function getPuzzleIdFromMeta(): string | null {
  const link = document.querySelector(
    '.puzzle__side__metas a[href^="/training/"]'
  );
  if (!link) return null;

  const href = link.getAttribute("href") ?? "";
  const segments = href.split("/").filter(Boolean);
  const id = segments[segments.length - 1];
  return id && id !== "training" ? id : null;
}

export function initLichessPuzzleDetector(): void {
  if (!isPuzzlePage()) return;
  if (observing) return;
  observing = true;

  console.log(LOG, "Observing puzzle feedback on", location.pathname);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const feedback = node.matches?.(".puzzle__feedback.after")
          ? node
          : node.querySelector?.(".puzzle__feedback.after");

        if (feedback) {
          handlePuzzleResult();
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function handlePuzzleResult(): void {
  let puzzleId: string | null = null;
  let result: EventResult;
  let detectionMethod: string;

  // Primary: session bar .current entry (has both puzzle ID and result)
  const sessionResult = getResultFromSessionBar();

  if (sessionResult) {
    puzzleId = sessionResult.puzzleId;
    result = sessionResult.result;
    detectionMethod = "dom-puzzle-session-current";
  } else {
    // Fallback: feedback panel content
    const feedbackResult = getResultFromFeedback();
    if (!feedbackResult) {
      console.log(LOG, "No result from session bar or feedback panel");
      return;
    }
    result = feedbackResult;
    detectionMethod = "dom-puzzle-feedback-fallback";
    // Try to get puzzle ID from the metadata panel
    puzzleId = getPuzzleIdFromMeta();
  }

  // Dedup by puzzle ID
  if (puzzleId && handledPuzzleIds.has(puzzleId)) {
    console.log(LOG, `Puzzle ${puzzleId}: already handled, skipping`);
    return;
  }

  console.log(
    LOG,
    `Puzzle ${puzzleId ?? "unknown"}: ${result} via ${detectionMethod}`
  );

  if (puzzleId) {
    handledPuzzleIds.add(puzzleId);
  }

  sendChessEvent({
    id: generateEventId("lichess", "puzzle"),
    type: "puzzle",
    result,
    platform: "lichess",
    timestamp: Date.now(),
    url: location.href,
    details: {
      detectionMethod,
      matchedSelector:
        detectionMethod === "dom-puzzle-session-current"
          ? ".puzzle__session a.current"
          : ".puzzle__feedback.after",
      puzzleId: puzzleId ?? undefined,
    },
  });
}
