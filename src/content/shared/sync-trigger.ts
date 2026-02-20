import { Platform, SyncGamesMessage } from "../../types";

/**
 * Send a SYNC_GAMES message to the background service worker.
 * The background handles debouncing and rate limiting.
 */
export function requestSync(platform: Platform, username: string): void {
  const message: SyncGamesMessage = {
    kind: "SYNC_GAMES",
    platform,
    username,
  };
  chrome.runtime.sendMessage(message);
}
