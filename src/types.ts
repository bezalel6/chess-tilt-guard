export type EventType = 'game' | 'puzzle';
export type EventResult = 'win' | 'loss' | 'draw';
export type Platform = 'chess.com' | 'lichess';

export interface ChessEvent {
  id: string;
  type: EventType;
  result: EventResult;
  platform: Platform;
  timestamp: number;
  url: string;
}

/** Message sent from content scripts to the background service worker. */
export interface ChessEventMessage {
  kind: 'CHESS_EVENT';
  payload: ChessEvent;
}

/** Message sent from the chess.com bridge (page context) to the content script via postMessage. */
export interface BridgeResultMessage {
  source: 'chess-tilt-guard-bridge';
  result: string;    // "1-0" | "0-1" | "1/2-1/2"
  playingAs: number; // 1=white, 2=black, 0=spectator
}
