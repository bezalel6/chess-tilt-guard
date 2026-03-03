export const STORAGE_KEY = "chess_tilt_guard_events";
export const PENDING_GAMES_KEY = "chess_tilt_guard_pending_games";
export const USERNAMES_KEY = "chess_tilt_guard_usernames";
export const MAX_EVENTS = 200;
export const MAX_PENDING_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const OVERLAY_VISIBLE_KEY = "chess_tilt_guard_overlay_visible";
export const LAST_SYNC_KEY = "chess_tilt_guard_last_sync";
export const MAX_STACK_SIZE_KEY = "chess_tilt_guard_max_stack_size";
export const DEFAULT_MAX_STACK_SIZE = 20;
export const SETTINGS_KEY = "chess_tilt_guard_settings";
export const DEFAULT_LOSS_STREAK_THRESHOLD = 2;
export const DEFAULT_PUZZLE_WINS_TO_UNBLOCK = 2;

/** @deprecated Migration-only. Use USERNAMES_KEY instead. */
export const CACHED_USERNAME_KEY = "chess_tilt_guard_username";
/** @deprecated Migration-only. Use USERNAMES_KEY instead. */
export const CACHED_LICHESS_USERNAME_KEY = "chess_tilt_guard_lichess_username";
