import { BRIDGE_SOURCE } from '../../constants';
import { BridgeResultMessage } from '../../types';
import { sendChessEvent, generateEventId } from '../shared/messaging';

const seenResults = new Set<string>();

function parseResult(
  rawResult: string,
  playingAs: number
): 'win' | 'loss' | 'draw' | null {
  if (rawResult === '1/2-1/2') return 'draw';

  const whiteWins = rawResult === '1-0';
  const isWhite = playingAs === 1;

  if (rawResult === '1-0' || rawResult === '0-1') {
    return whiteWins === isWhite ? 'win' : 'loss';
  }

  return null;
}

export function initChessComGameDetector(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const data = event.data as BridgeResultMessage;
    if (data?.source !== BRIDGE_SOURCE) return;

    // Skip spectator
    if (data.playingAs === 0) return;

    // Dedup within this tab (5-second window)
    const dedupKey = `${data.result}-${data.playingAs}-${Math.floor(Date.now() / 5000)}`;
    if (seenResults.has(dedupKey)) return;
    seenResults.add(dedupKey);

    const result = parseResult(data.result, data.playingAs);
    if (!result) return;

    sendChessEvent({
      id: generateEventId('chess.com', 'game'),
      type: 'game',
      result,
      platform: 'chess.com',
      timestamp: Date.now(),
      url: location.href,
    });
  });
}
