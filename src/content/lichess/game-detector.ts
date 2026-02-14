import { sendChessEvent, generateEventId } from '../shared/messaging';

const seenResults = new Set<string>();

function isPlayerView(): boolean {
  // Player game URLs have 12-char IDs (/abcdefghijkl), spectator URLs have 8-char (/abcdefgh)
  const pathParts = location.pathname.split('/');
  const gameId = pathParts[1];
  return gameId?.length === 12;
}

function getUserColor(): 'white' | 'black' | null {
  const board = document.querySelector('.cg-wrap');
  if (board?.classList.contains('orientation-white')) return 'white';
  if (board?.classList.contains('orientation-black')) return 'black';
  return null;
}

function parseResult(
  resultText: string,
  userColor: 'white' | 'black'
): 'win' | 'loss' | 'draw' | null {
  const trimmed = resultText.trim();

  if (trimmed === '½-½' || trimmed === '1/2-1/2') return 'draw';

  const whiteWins = trimmed === '1-0';
  const isWhite = userColor === 'white';

  if (trimmed === '1-0' || trimmed === '0-1') {
    return whiteWins === isWhite ? 'win' : 'loss';
  }

  return null;
}

export function initLichessGameDetector(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const resultWrap = (
          node.matches?.('.result-wrap') ? node
          : node.querySelector?.('.result-wrap')
        ) as HTMLElement | null;

        if (resultWrap) {
          handleGameResult(resultWrap);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function handleGameResult(resultWrap: HTMLElement): void {
  if (!isPlayerView()) return;

  const resultEl = resultWrap.querySelector('p.result');
  if (!resultEl) return;

  const resultText = resultEl.textContent ?? '';
  const userColor = getUserColor();
  if (!userColor) return;

  const result = parseResult(resultText, userColor);
  if (!result) return;

  // Dedup within this tab (5-second window)
  const dedupKey = `${resultText}-${userColor}-${Math.floor(Date.now() / 5000)}`;
  if (seenResults.has(dedupKey)) return;
  seenResults.add(dedupKey);

  sendChessEvent({
    id: generateEventId('lichess', 'game'),
    type: 'game',
    result,
    platform: 'lichess',
    timestamp: Date.now(),
    url: location.href,
  });
}
