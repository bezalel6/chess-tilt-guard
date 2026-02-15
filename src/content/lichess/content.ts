import { initLichessGameDetector } from "./game-detector";
import { initLichessPuzzleDetector } from "./puzzle-detector";
import { initLichessGameBlocker } from "./game-blocker";
import { watchNavigation } from "../shared/navigation";
import { initOverlay } from "../shared/overlay";

function init(): void {
  console.log("[Chess Tilt Guard] Lichess content script loaded");
  initLichessGameDetector();
  initLichessPuzzleDetector();
  initLichessGameBlocker();
  initOverlay();
}

watchNavigation(() => {
  initLichessPuzzleDetector();
  initLichessGameBlocker();
});

init();
