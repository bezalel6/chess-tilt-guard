import { sendChessEvent, generateEventId } from '../shared/messaging';

const seenPuzzles = new Set<string>();
let observing = false;

export function initChessComPuzzleDetector(): void {
  if (!location.pathname.startsWith('/puzzles')) return;
  if (observing) return;
  observing = true;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const feedback = (
          node.matches?.('.cc-coach-feedback-detail-component') ? node
          : node.querySelector?.('.cc-coach-feedback-detail-component')
        ) as HTMLElement | null;

        if (feedback) {
          handlePuzzleResult(feedback);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function handlePuzzleResult(el: HTMLElement): void {
  const text = el.textContent?.toLowerCase() ?? '';

  let result: 'win' | 'loss';
  if (
    text.includes('excellent') ||
    text.includes('correct') ||
    text.includes('best')
  ) {
    result = 'win';
  } else {
    result = 'loss';
  }

  const dedupKey = `puzzle-${Math.floor(Date.now() / 3000)}`;
  if (seenPuzzles.has(dedupKey)) return;
  seenPuzzles.add(dedupKey);

  sendChessEvent({
    id: generateEventId('chess.com', 'puzzle'),
    type: 'puzzle',
    result,
    platform: 'chess.com',
    timestamp: Date.now(),
    url: location.href,
  });
}
