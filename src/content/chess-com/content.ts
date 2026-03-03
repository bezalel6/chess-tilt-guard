import { initChessComGameDetector } from "./game-detector";
import { initChessComPuzzleDetector } from "./puzzle-detector";
import { initChessComGameBlocker } from "./game-blocker";
import { watchNavigation } from "../shared/navigation";
import { initOverlay } from "../shared/overlay";
import { requestSync } from "../shared/sync-trigger";
import { USERNAMES_KEY } from "../../constants";
import { StoredUsernames } from "../../types";

import { OVERLAY_VISIBLE_KEY } from "../../constants";

function init(): void {
  console.log("[Chess Tilt Guard] Chess.com content script loaded");
  initChessComGameDetector();
  initChessComPuzzleDetector();
  initChessComGameBlocker();
  triggerSync();

  // Only initialize overlay if not disabled — takes effect on page load
  chrome.storage.local.get(OVERLAY_VISIBLE_KEY, (data) => {
    if (data[OVERLAY_VISIBLE_KEY] !== false) {
      initOverlay();
    }
  });
}

/** Request a background API sync using the stored chess.com username. */
async function triggerSync(): Promise<void> {
  const data = await chrome.storage.local.get(USERNAMES_KEY);
  const stored: StoredUsernames = data[USERNAMES_KEY] ?? {};
  const username = stored["chess.com"]?.username;
  if (username) {
    requestSync("chess.com", username);
  }
}

watchNavigation(() => {
  // Re-run detectors on SPA navigation (chess.com is a SPA)
  // Note: puzzle detector manages its own navigation watching internally
  initChessComGameDetector();
  initChessComGameBlocker();
  triggerSync();
});

init();
