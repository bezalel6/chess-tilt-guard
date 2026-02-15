import { initChessComGameDetector } from "./game-detector";
import { initChessComPuzzleDetector } from "./puzzle-detector";
import { initChessComGameBlocker } from "./game-blocker";
import { watchNavigation } from "../shared/navigation";
import { initOverlay } from "../shared/overlay";

function init(): void {
  console.log("[Chess Tilt Guard] Chess.com content script loaded");
  initChessComGameDetector();
  initChessComPuzzleDetector();
  initChessComGameBlocker();
  initOverlay();
}

watchNavigation(() => {
  // Re-run detectors on SPA navigation (chess.com is a SPA)
  initChessComGameDetector();
  initChessComPuzzleDetector();
  initChessComGameBlocker();
});

init();
