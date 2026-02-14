import { sendChessEvent, generateEventId } from '../shared/messaging';

const seenPuzzles = new Set<string>();
let observing = false;

function isPuzzlePage(): boolean {
  return (
    location.pathname.startsWith('/training') ||
    location.pathname.startsWith('/streak')
  );
}

export function initLichessPuzzleDetector(): void {
  if (!isPuzzlePage()) return;
  if (observing) return;
  observing = true;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const feedback =
          node.matches?.('.puzzle__feedback.after') ? node
          : node.querySelector?.('.puzzle__feedback.after');

        if (feedback) {
          handlePuzzleResult();
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function handlePuzzleResult(): void {
  // Check the most recent result in the session bar
  const sessionLinks = document.querySelectorAll('.puzzle__session a');
  const lastLink = sessionLinks[sessionLinks.length - 1];

  let result: 'win' | 'loss';
  if (lastLink?.classList.contains('result-true')) {
    result = 'win';
  } else if (lastLink?.classList.contains('result-false')) {
    result = 'loss';
  } else {
    // Fallback: check the feedback content
    const feedback = document.querySelector('.puzzle__feedback.after');
    const icon = feedback?.querySelector('.complete, .good');
    result = icon ? 'win' : 'loss';
  }

  const dedupKey = `puzzle-${Math.floor(Date.now() / 3000)}`;
  if (seenPuzzles.has(dedupKey)) return;
  seenPuzzles.add(dedupKey);

  sendChessEvent({
    id: generateEventId('lichess', 'puzzle'),
    type: 'puzzle',
    result,
    platform: 'lichess',
    timestamp: Date.now(),
    url: location.href,
  });
}
