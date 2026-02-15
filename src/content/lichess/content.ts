import { initLichessGameDetector } from './game-detector';
import { initLichessPuzzleDetector } from './puzzle-detector';
import { watchNavigation } from '../shared/navigation';
import { initOverlay } from '../shared/overlay';

function init(): void {
  console.log('[Chess Tilt Guard] Lichess content script loaded');
  initLichessGameDetector();
  initLichessPuzzleDetector();
  initOverlay();
}

watchNavigation(() => {
  initLichessPuzzleDetector();
});

init();
