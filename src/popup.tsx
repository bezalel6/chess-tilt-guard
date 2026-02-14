import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChessEvent } from './types';
import { STORAGE_KEY } from './constants';

function getRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const RESULT_COLORS: Record<string, string> = {
  win: '#4caf50',
  loss: '#f44336',
  draw: '#9e9e9e',
};

const RESULT_LABELS: Record<string, string> = {
  win: 'W',
  loss: 'L',
  draw: 'D',
};

const Popup: React.FC = () => {
  const [events, setEvents] = useState<ChessEvent[]>([]);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      setEvents(data[STORAGE_KEY] ?? []);
    });

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[STORAGE_KEY]) {
        setEvents(changes[STORAGE_KEY].newValue ?? []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const clearHistory = () => {
    chrome.storage.local.remove(STORAGE_KEY);
    setEvents([]);
  };

  return (
    <div style={{ width: 340, fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          borderBottom: '1px solid #333',
          background: '#1a1a2e',
          color: '#fff',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>Chess Tilt Guard</span>
        <button
          onClick={clearHistory}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
            padding: '3px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Clear
        </button>
      </div>

      {/* Event list */}
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {events.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>
            No events yet. Play a game or solve a puzzle!
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: RESULT_COLORS[event.result] ?? '#9e9e9e',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {RESULT_LABELS[event.result] ?? '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {event.result.charAt(0).toUpperCase() + event.result.slice(1)}{' '}
                  &mdash; {event.type}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {event.platform} &middot; {getRelativeTime(event.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
