/**
 * Bridge script — injected into the chess.com PAGE context.
 * Accesses the `wc-chess-board.game` API to read game results,
 * then posts them to the content script via window.postMessage.
 *
 * This file is bundled as a standalone entry and loaded via <script src>.
 */

const BRIDGE_SOURCE = 'chess-tilt-guard-bridge';

function detectGameResult(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const modal =
          node.matches?.('.game-over-modal-buttons') ? node
          : node.querySelector?.('.game-over-modal-buttons');

        if (modal) {
          readAndPostResult();
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function readAndPostResult(): void {
  try {
    const board = document.querySelector('wc-chess-board') as any;
    if (!board?.game) return;

    const result: string | undefined = board.game.getResult?.()?.result;
    const playingAs: number | undefined = board.game.getPlayingAs?.();

    if (!result || playingAs === undefined) return;

    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        result,
        playingAs,
      },
      '*'
    );
  } catch (e) {
    console.error('[Chess Tilt Guard] Bridge error:', e);
  }
}

detectGameResult();
