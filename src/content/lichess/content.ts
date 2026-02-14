import { initLichessGameDetector } from './game-detector';
import { initLichessPuzzleDetector } from './puzzle-detector';
import { watchNavigation } from '../shared/navigation';

function init(): void {
  console.log('[Chess Tilt Guard] Lichess content script loaded');
  initLichessGameDetector();
  initLichessPuzzleDetector();
}

watchNavigation(() => {
  initLichessPuzzleDetector();
});

init();
