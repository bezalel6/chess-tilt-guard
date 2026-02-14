import { ChessEventMessage } from './types';
import { addEvent } from './storage';

chrome.runtime.onMessage.addListener(
  (message: ChessEventMessage, _sender, sendResponse) => {
    if (message.kind === 'CHESS_EVENT') {
      addEvent(message.payload)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error('[Chess Tilt Guard] Failed to store event:', err);
          sendResponse({ success: false });
        });
      return true; // keep message channel open for async response
    }
  }
);
