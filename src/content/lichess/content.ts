import { initLichessGameDetector } from "./game-detector";
import { initLichessPuzzleDetector } from "./puzzle-detector";
import { initLichessGameBlocker } from "./game-blocker";
import { watchNavigation } from "../shared/navigation";
import { initOverlay } from "../shared/overlay";
import { resolveLichessUsername } from "./username-detector";
import { requestSync } from "../shared/sync-trigger";

function init(): void {
  console.log("[Chess Tilt Guard] Lichess content script loaded");
  initLichessGameDetector();
  initLichessPuzzleDetector();
  initLichessGameBlocker();
  initOverlay();
  triggerSync();
}

/** Detect username and request a background API sync for Lichess. */
async function triggerSync(): Promise<void> {
  const username = await resolveLichessUsername();
  if (username) {
    requestSync("lichess", username);
  }
}

watchNavigation(() => {
  initLichessPuzzleDetector();
  initLichessGameBlocker();
  triggerSync();
});

init();
