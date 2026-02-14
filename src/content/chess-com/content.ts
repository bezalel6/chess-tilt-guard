import { initChessComGameDetector } from './game-detector';
import { initChessComPuzzleDetector } from './puzzle-detector';
import { watchNavigation } from '../shared/navigation';

function injectBridge(): void {
  if (document.getElementById('chess-tilt-guard-bridge')) return;

  const script = document.createElement('script');
  script.id = 'chess-tilt-guard-bridge';
  script.src = chrome.runtime.getURL('js/bridge_chess_com.js');
  (document.head || document.documentElement).appendChild(script);
}

function init(): void {
  console.log('[Chess Tilt Guard] Chess.com content script loaded');
  injectBridge();
  initChessComGameDetector();
  initChessComPuzzleDetector();
}

watchNavigation(() => {
  initChessComPuzzleDetector();
});

init();
