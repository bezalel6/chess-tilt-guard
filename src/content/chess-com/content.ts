import { initChessComGameDetector } from "./game-detector";
import { initChessComPuzzleDetector } from "./puzzle-detector";
import { initChessComGameBlocker } from "./game-blocker";
import { watchNavigation } from "../shared/navigation";
import { initOverlay } from "../shared/overlay";
import { requestSync } from "../shared/sync-trigger";
import { CACHED_USERNAME_KEY } from "../../constants";

function init(): void {
  console.log("[Chess Tilt Guard] Chess.com content script loaded");
  initChessComGameDetector();
  initChessComPuzzleDetector();
  initChessComGameBlocker();
  initOverlay();
  triggerSync();
}

/** Request a background API sync using the cached chess.com username. */
async function triggerSync(): Promise<void> {
  const data = await chrome.storage.local.get(CACHED_USERNAME_KEY);
  const username = data[CACHED_USERNAME_KEY];
  if (username) {
    requestSync("chess.com", username);
  }
}

watchNavigation(() => {
  // Re-run detectors on SPA navigation (chess.com is a SPA)
  initChessComGameDetector();
  initChessComPuzzleDetector();
  initChessComGameBlocker();
  triggerSync();
});

init();
