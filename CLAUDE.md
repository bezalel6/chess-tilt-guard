# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm run build          # Production build (webpack/webpack.prod.js)
npm run watch          # Dev build with file watching (webpack/webpack.dev.js)
npm run clean          # Delete dist/
npm run style          # Format with Prettier
```

No test runner is configured. No linter is configured.

After building, load `dist/` as an unpacked extension in `chrome://extensions`.

## Architecture

Chrome Extension (Manifest V3) that detects chess game results and puzzle outcomes on chess.com and lichess.org, displaying them in an on-page overlay and popup.

### Entry Points (webpack/webpack.common.js)

| Entry | File | Description |
|-------|------|-------------|
| `popup` | `src/popup.tsx` | React popup UI (only entry with vendor chunk splitting) |
| `background` | `src/background.ts` | Service worker — stores events, fetches chess.com API |
| `content_chess_com` | `src/content/chess-com/content.ts` | Chess.com content script |
| `content_lichess` | `src/content/lichess/content.ts` | Lichess content script |

Content scripts must be self-contained (no shared chunks) — enforced by the splitChunks config.

### Detection Strategies

**Chess.com games**: Pending-game queue pattern. When the user visits `/game/{id}`, the game URL is stored as "pending." On any page load, pending games are resolved via the public API (`api.chess.com/pub/player/{username}/games/{YYYY}/{MM}`). The background service worker does the fetching.

**Chess.com puzzles**: DOM-based with MutationObserver on `.cc-coach-feedback-detail-component`. Uses SVG fill color detection (primary) with text phrase matching (fallback). Filters out "to move" prompts to avoid false positives.

**Lichess games**: DOM-based observation of `div.result-wrap > p.result`. Distinguishes player vs spectator by URL path length (12-char = player, 8-char = spectator).

**Lichess puzzles**: DOM-based observation of `.puzzle__feedback.after` and `.puzzle__session` result classes.

### Data Flow

```
Content script detectors → chrome.runtime.sendMessage → Background service worker → chrome.storage.local
                                                                                          ↓
                                                              Overlay (shadow DOM) ← chrome.storage.onChanged → Popup (React)
```

### Key Shared Modules
- `src/types.ts` — All shared interfaces (`ChessEvent`, `EventDetails`, API types, message types)
- `src/constants.ts` — Storage keys, limits (max 200 events, 7-day pending game TTL)
- `src/storage.ts` — Chrome storage abstraction with dedup-by-ID and queue capping
- `src/content/shared/overlay.ts` — Shadow DOM floating panel injected on chess pages
- `src/content/shared/navigation.ts` — SPA URL change detection via MutationObserver on `document.body`

### Chess.com Username Detection

The content script tries multiple DOM selectors to find the logged-in user's username (chess.com frequently renames component classes). Found usernames are cached in `chrome.storage.local`. The selector list is in `game-detector.ts:USERNAME_SELECTORS`.

## Conventions

- Console log prefix: `[CTG Background]`, `[CTG GameDetector]`, `[CTG PuzzleDetector]`, `[Chess Tilt Guard]`
- Event IDs: `chesscom-game-{url}` for API-resolved games, `{platform}-{type}-{timestamp}-{random}` for DOM-detected events
- All game ID comparisons use `extractGameId()` to normalize URL variants (`/game/123` vs `/game/live/123`)
