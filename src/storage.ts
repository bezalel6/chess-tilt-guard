import { ChessEvent } from "./types";
import {
  STORAGE_KEY,
  MAX_STACK_SIZE_KEY,
  DEFAULT_MAX_STACK_SIZE,
} from "./constants";

export async function getEvents(): Promise<ChessEvent[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] ?? [];
}

async function getMaxStackSize(): Promise<number> {
  const data = await chrome.storage.local.get(MAX_STACK_SIZE_KEY);
  return data[MAX_STACK_SIZE_KEY] ?? DEFAULT_MAX_STACK_SIZE;
}

/**
 * Merge new events into the existing stack.
 * - Deduplicates by event ID
 * - Sorts by timestamp (newest first)
 * - Caps to the user's configured max stack size
 * - Single storage write (no badge flicker)
 */
export async function mergeEvents(newEvents: ChessEvent[]): Promise<void> {
  if (newEvents.length === 0) return;

  const existing = await getEvents();
  const maxSize = await getMaxStackSize();
  const existingIds = new Set(existing.map((e) => e.id));

  // Filter out duplicates
  const unique = newEvents.filter((e) => !existingIds.has(e.id));
  if (unique.length === 0) return;

  // Combine, sort by timestamp (newest first), cap
  const merged = [...existing, ...unique];
  merged.sort((a, b) => b.timestamp - a.timestamp);

  if (merged.length > maxSize) {
    merged.length = maxSize;
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
}

/**
 * Add a single event to the stack.
 * Delegates to mergeEvents for consistent ordering and dedup.
 */
export async function addEvent(event: ChessEvent): Promise<void> {
  await mergeEvents([event]);
}

export async function clearEvents(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
