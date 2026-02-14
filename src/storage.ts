import { ChessEvent } from './types';
import { STORAGE_KEY, MAX_EVENTS } from './constants';

export async function getEvents(): Promise<ChessEvent[]> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] ?? [];
}

export async function addEvent(event: ChessEvent): Promise<void> {
  const events = await getEvents();

  if (events.some((e) => e.id === event.id)) return;

  events.unshift(event);

  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: events });
}

export async function clearEvents(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
