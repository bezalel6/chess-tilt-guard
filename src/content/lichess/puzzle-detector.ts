import { sendChessEvent, generateEventId } from "../shared/messaging";
import { EventResult } from "../../types";

const seenPuzzles = new Set<string>();
let observing = false;

function isPuzzlePage(): boolean {
  return (
    location.pathname.startsWith("/training") ||
    location.pathname.startsWith("/streak")
  );
}

export function initLichessPuzzleDetector(): void {
  if (!isPuzzlePage()) return;
  if (observing) return;
  observing = true;

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
  // Check the most recent result in the session bar
  const sessionLinks = document.querySelectorAll(".puzzle__session a");
  const lastLink = sessionLinks[sessionLinks.length - 1];

  let result: EventResult;
  let sessionDetected = false;

  if (lastLink?.classList.contains("result-true")) {
    result = "win";
    sessionDetected = true;
  } else if (lastLink?.classList.contains("result-false")) {
    result = "loss";
    sessionDetected = true;
  } else {
    // Fallback: check the feedback content directly
    const feedback = document.querySelector(".puzzle__feedback.after");
    const icon = feedback?.querySelector(".complete, .good");
    result = icon ? "win" : "loss";
  }

  const dedupKey = `puzzle-${Math.floor(Date.now() / 3000)}`;
  if (seenPuzzles.has(dedupKey)) return;
  seenPuzzles.add(dedupKey);

  // Extract puzzle ID from URL: /training/AbCdE
  const urlParts = location.pathname.split("/");
  const puzzleId = urlParts[urlParts.length - 1] || undefined;

  sendChessEvent({
    id: generateEventId("lichess", "puzzle"),
    type: "puzzle",
    result,
    platform: "lichess",
    timestamp: Date.now(),
    url: location.href,
    details: {
      detectionMethod: sessionDetected
        ? "dom-puzzle-session-bar"
        : "dom-puzzle-feedback-fallback",
      matchedSelector: sessionDetected
        ? ".puzzle__session a.result-true / .result-false"
        : ".puzzle__feedback.after .complete / .good",
      puzzleId,
      extra: {
        sessionLinkCount: sessionLinks.length,
        lastLinkClasses: lastLink
          ? Array.from(lastLink.classList).join(" ")
          : "none",
      },
    },
  });
}
