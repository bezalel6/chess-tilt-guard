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

function buildHeadline(event: ChessEvent): string {
  const resultLabel = event.result.charAt(0).toUpperCase() + event.result.slice(1);

  if (event.type === 'game' && event.details.playerColor) {
    const color =
      event.details.playerColor.charAt(0).toUpperCase() +
      event.details.playerColor.slice(1);
    const reason = event.details.endReason ? ` \u2013 ${event.details.endReason}` : '';
    return `${resultLabel} as ${color}${reason}`;
  }

  if (event.type === 'puzzle') {
    return `Puzzle ${event.result === 'win' ? 'Solved' : 'Failed'}`;
  }

  return `${resultLabel} \u2013 ${event.type}`;
}

const RESULT_COLORS: Record<string, string> = {
  win: '#4caf50',
  loss: '#f44336',
  draw: '#9e9e9e',
};

const Popup: React.FC = () => {
  const [events, setEvents] = useState<ChessEvent[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
    setExpandedIds(new Set());
  };

  const toggleDetails = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ width: 360, fontFamily: 'system-ui, sans-serif', fontSize: 13, background: '#1a1a2e', color: '#e0e0e0' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 12px',
          borderBottom: '1px solid #2d2d44',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>Chess Tilt Guard</span>
        <button
          onClick={clearHistory}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#aaa',
            padding: '3px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {events.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#666', fontSize: 12 }}>
            No events yet. Play a game or solve a puzzle.
          </div>
        ) : (
          events.map((event) => {
            const isOpen = expandedIds.has(event.id);
            return (
              <div
                key={event.id}
                style={{ padding: '8px 12px', borderBottom: '1px solid #2d2d44' }}
              >
                {/* Compact header row — click to expand */}
                <div
                  onClick={() => toggleDetails(event.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: RESULT_COLORS[event.result] ?? '#9e9e9e',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>
                      {buildHeadline(event)}
                    </div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>
                      {event.platform} &middot; {event.type}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: '#666', flexShrink: 0 }}>
                    {getRelativeTime(event.timestamp)}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: '#555',
                      flexShrink: 0,
                      marginLeft: 2,
                      transition: 'transform 0.2s ease',
                      display: 'inline-block',
                      transform: isOpen ? 'rotate(90deg)' : 'none',
                    }}
                  >
                    &#9656;
                  </span>
                </div>

                {/* Collapsible details */}
                {isOpen && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: '6px 8px',
                      background: 'rgba(0,0,0,0.25)',
                      borderRadius: 4,
                      fontSize: 10,
                      fontFamily: "'SF Mono', 'Cascadia Code', Consolas, monospace",
                      color: '#999',
                      lineHeight: 1.5,
                      wordBreak: 'break-all' as const,
                    }}
                  >
                    <DetailRow label="method" value={event.details.detectionMethod} />
                    {event.details.matchedSelector && (
                      <DetailRow label="selector" value={event.details.matchedSelector} />
                    )}
                    {event.details.rawResult && (
                      <DetailRow label="raw_result" value={event.details.rawResult} />
                    )}
                    {event.details.rawPlayingAs !== undefined && (
                      <DetailRow label="playing_as" value={String(event.details.rawPlayingAs)} />
                    )}
                    {event.details.playerColor && (
                      <DetailRow label="color" value={event.details.playerColor} />
                    )}
                    {event.details.endReason && (
                      <DetailRow label="end_reason" value={event.details.endReason} />
                    )}
                    {event.details.puzzleId && (
                      <DetailRow label="puzzle_id" value={event.details.puzzleId} />
                    )}
                    <DetailRow label="event_id" value={event.id} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 4 }}>
    <span style={{ color: '#6b7280', flexShrink: 0 }}>{label}:</span>
    <span style={{ color: '#a5b4c4' }}>{value}</span>
  </div>
);

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
