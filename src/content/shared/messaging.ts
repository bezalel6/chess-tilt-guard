import { ChessEvent, ChessEventMessage } from "../../types";

export function sendChessEvent(event: ChessEvent): void {
  const message: ChessEventMessage = {
    kind: "CHESS_EVENT",
    payload: event,
  };
  chrome.runtime.sendMessage(message);
}

export function generateEventId(platform: string, type: string): string {
  return `${platform}-${type}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
