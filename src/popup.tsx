import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChessEvent, Platform, StoredUsernames, UsernameEntry, UserSettings } from "./types";
import {
  STORAGE_KEY,
  OVERLAY_VISIBLE_KEY,
  MAX_STACK_SIZE_KEY,
  DEFAULT_MAX_STACK_SIZE,
  USERNAMES_KEY,
  SETTINGS_KEY,
  DEFAULT_LOSS_STREAK_THRESHOLD,
  DEFAULT_PUZZLE_WINS_TO_UNBLOCK,
  DEFAULT_PUZZLE_RUSH_MIN_SCORE,
} from "./constants";
import {
  BlockingState,
  computeBlockingState,
} from "./content/shared/blocking-logic";
import { CHESS_COM_LOGO, LICHESS_LOGO } from "./content/shared/logos";
import { renderMiniboard } from "./content/shared/miniboard";

const RESULT_COLORS: Record<string, { border: string; bg: string }> = {
  win: { border: "#4caf50", bg: "rgba(76, 175, 80, 0.08)" },
  loss: { border: "#f44336", bg: "rgba(244, 67, 54, 0.08)" },
  draw: { border: "#9e9e9e", bg: "rgba(158, 158, 158, 0.08)" },
};

function getRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildHeadline(event: ChessEvent): string {
  if (event.type === "puzzle_rush") {
    const score = (event.details.extra?.score as number) ?? 0;
    return `Puzzle Rush: ${score}`;
  }

  if (event.type === "puzzle") {
    return event.result === "win" ? "Puzzle Solved" : "Puzzle Failed";
  }

  const resultLabel =
    event.result.charAt(0).toUpperCase() + event.result.slice(1);

  if (event.details.playerColor) {
    const color =
      event.details.playerColor.charAt(0).toUpperCase() +
      event.details.playerColor.slice(1);
    return `${resultLabel} as ${color}`;
  }

  return resultLabel;
}

function formatTimeControl(timeControl: string): string | null {
  const parts = timeControl.split("+");
  const baseSeconds = parseInt(parts[0], 10);
  if (isNaN(baseSeconds)) return null;
  if (baseSeconds >= 86400) return null;

  const baseMinutes = Math.floor(baseSeconds / 60);
  const increment = parts[1] ?? "0";
  return `${baseMinutes}+${increment}`;
}

function buildMetaLine(event: ChessEvent): string {
  const parts: string[] = [];

  const extra = event.details.extra;
  if (extra) {
    const timeClass = extra.timeClass as string | undefined;
    const timeControl = extra.timeControl as string | undefined;

    if (timeClass) {
      const classLabel = timeClass.charAt(0).toUpperCase() + timeClass.slice(1);
      if (timeControl) {
        const formatted = formatTimeControl(timeControl);
        parts.push(formatted ? `${classLabel} ${formatted}` : classLabel);
      } else {
        parts.push(classLabel);
      }
    } else if (timeControl) {
      const formatted = formatTimeControl(timeControl);
      if (formatted) parts.push(formatted);
    }
  }

  if (event.details.endReason) {
    parts.push(event.details.endReason);
  }

  if (parts.length === 0) {
    parts.push(event.platform);
  }

  return parts.join(" \u00B7 ");
}

function getPlatformSvg(platform: Platform): string {
  return platform === "chess.com" ? CHESS_COM_LOGO : LICHESS_LOGO;
}

const BlockingBanner: React.FC<{ state: BlockingState }> = ({ state }) => {
  if (!state.blocked) return null;

  const progress =
    state.puzzleWinsAfterStreak > 0
      ? `${state.puzzleWinsAfterStreak}/${state.puzzleWinsRequired} puzzles solved`
      : `Solve ${state.puzzleWinsRequired} puzzles in a row to unlock`;

  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(244, 67, 54, 0.15)",
        borderBottom: "1px solid rgba(244, 67, 54, 0.3)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 16 }}>&#9888;&#65039;</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: "#f44336" }}>
          Game Blocking Active
        </div>
        <div style={{ fontSize: 10, color: "#aaa", marginTop: 1 }}>
          {state.consecutiveLosses} losses in a row &middot; {progress}
        </div>
      </div>
    </div>
  );
};

function buildTooltipMeta(event: ChessEvent): string[] {
  const lines: string[] = [];
  const extra = event.details.extra;

  if (event.type === "game") {
    if (extra?.opponentUsername) {
      const oppRating = extra.opponentRating
        ? ` (${extra.opponentRating})`
        : "";
      lines.push(`vs ${extra.opponentUsername}${oppRating}`);
    }
    if (extra?.playerRating) {
      lines.push(`Rating: ${extra.playerRating}`);
    }
    if (extra?.timeClass) {
      const tc = extra.timeControl
        ? formatTimeControl(String(extra.timeControl))
        : null;
      const label =
        String(extra.timeClass).charAt(0).toUpperCase() +
        String(extra.timeClass).slice(1);
      lines.push(tc ? `${label} ${tc}` : label);
    }
    if (event.details.endReason) {
      lines.push(event.details.endReason);
    }
  } else if (event.type === "puzzle_rush") {
    const score = (extra?.score as number) ?? 0;
    lines.push(`Score: ${score}`);
    lines.push(event.platform);
  } else {
    if (event.details.puzzleId) {
      lines.push(`Puzzle #${event.details.puzzleId}`);
    }
    lines.push(event.platform);
  }

  return lines;
}

const EventTooltip: React.FC<{
  event: ChessEvent;
  anchorRect: DOMRect | null;
}> = ({ event, anchorRect }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number } | null>(null);

  const hasFen = !!event.details.fen;
  const metaLines = buildTooltipMeta(event);
  const hasContent = hasFen || metaLines.length > 0;

  // Measure tooltip after render and clamp to viewport
  useEffect(() => {
    if (!anchorRect || !tooltipRef.current || !hasContent) {
      setPos(null);
      return;
    }
    const tooltipH = tooltipRef.current.offsetHeight;
    const viewportH = window.innerHeight;
    // Try to vertically center on the anchor row
    const cardCenter = anchorRect.top + anchorRect.height / 2;
    let top = cardCenter - tooltipH / 2;
    // Clamp within viewport with 4px margin
    top = Math.max(4, Math.min(top, viewportH - tooltipH - 4));
    setPos({ top });
  }, [anchorRect, hasContent]);

  if (!anchorRect || !hasContent) return null;

  const miniboardHtml = hasFen ? renderMiniboard(event.details.fen!) : "";

  return (
    <div
      ref={tooltipRef}
      style={{
        position: "fixed",
        left: 8,
        top: pos ? pos.top : -9999,
        visibility: pos ? "visible" : "hidden",
        background: "#1e1e36",
        border: "1px solid #3d3d5c",
        borderRadius: 6,
        boxShadow: "0 6px 24px rgba(0, 0, 0, 0.6)",
        padding: 8,
        zIndex: 999999,
        pointerEvents: "none",
        maxWidth: 220,
      }}
    >
      {miniboardHtml && (
        <div dangerouslySetInnerHTML={{ __html: miniboardHtml }} />
      )}
      {metaLines.length > 0 && (
        <div
          style={{
            fontSize: 10,
            color: "#bbb",
            marginTop: hasFen ? 6 : 0,
            lineHeight: 1.5,
          }}
        >
          {metaLines.map((line, i) => (
            <div
              key={i}
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EventCard: React.FC<{
  event: ChessEvent;
  onHover: (event: ChessEvent, rect: DOMRect | null) => void;
}> = ({ event, onHover }) => {
  let colors = RESULT_COLORS[event.result] ?? RESULT_COLORS.draw;
  if (event.type === "puzzle_rush") {
    colors = { border: "#ffa726", bg: "rgba(255, 167, 38, 0.08)" };
  }
  const cardRef = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    if (event.url) {
      chrome.tabs.create({ url: event.url });
    }
  };

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid #2d2d44",
        borderLeft: `3px solid ${colors.border}`,
        background: colors.bg,
        cursor: event.url ? "pointer" : "default",
        transition: "filter 0.15s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.filter = "brightness(1.25)";
        const rect = cardRef.current?.getBoundingClientRect() ?? null;
        onHover(event, rect);
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.filter = "none";
        onHover(event, null);
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{ flexShrink: 0, display: "flex", alignItems: "center" }}
          dangerouslySetInnerHTML={{ __html: getPlatformSvg(event.platform) }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "#e0e0e0" }}>
            {buildHeadline(event)}
          </div>
          <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>
            {buildMetaLine(event)}
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#666", flexShrink: 0 }}>
          {getRelativeTime(event.timestamp)}
        </div>
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(255,255,255,0.2)",
  color: "#aaa",
  padding: "3px 8px",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11,
};

const Popup: React.FC = () => {
  const [events, setEvents] = useState<ChessEvent[]>([]);
  const [blockingState, setBlockingState] = useState<BlockingState>({
    blocked: false,
    consecutiveLosses: 0,
    puzzleWinsAfterStreak: 0,
    puzzleWinsNeeded: 0,
    puzzleWinsRequired: DEFAULT_PUZZLE_WINS_TO_UNBLOCK,
    rushScoreAfterStreak: 0,
    rushScoreRequired: DEFAULT_PUZZLE_RUSH_MIN_SCORE,
  });
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [maxStackSize, setMaxStackSize] = useState(DEFAULT_MAX_STACK_SIZE);
  const [lossThreshold, setLossThreshold] = useState(DEFAULT_LOSS_STREAK_THRESHOLD);
  const [puzzleWins, setPuzzleWins] = useState(DEFAULT_PUZZLE_WINS_TO_UNBLOCK);
  const [rushMinScore, setRushMinScore] = useState(DEFAULT_PUZZLE_RUSH_MIN_SCORE);
  const [hoveredEvent, setHoveredEvent] = useState<ChessEvent | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [usernames, setUsernames] = useState<StoredUsernames>({});
  const [editChessCom, setEditChessCom] = useState("");
  const [editLichess, setEditLichess] = useState("");
  const [accountsOpen, setAccountsOpen] = useState(false);

  const handleEventHover = (event: ChessEvent, rect: DOMRect | null) => {
    if (rect) {
      setHoveredEvent(event);
      setTooltipRect(rect);
    } else {
      setHoveredEvent(null);
      setTooltipRect(null);
    }
  };

  useEffect(() => {
    chrome.storage.local.get(
      [STORAGE_KEY, OVERLAY_VISIBLE_KEY, MAX_STACK_SIZE_KEY, USERNAMES_KEY, SETTINGS_KEY],
      (data) => {
        const stored = data[STORAGE_KEY] ?? [];
        const settings: UserSettings | undefined = data[SETTINGS_KEY];
        const lt = settings?.lossStreakThreshold ?? DEFAULT_LOSS_STREAK_THRESHOLD;
        const pw = settings?.puzzleWinsToUnblock ?? DEFAULT_PUZZLE_WINS_TO_UNBLOCK;
        const rms = settings?.puzzleRushMinScore ?? DEFAULT_PUZZLE_RUSH_MIN_SCORE;
        setLossThreshold(lt);
        setPuzzleWins(pw);
        setRushMinScore(rms);
        setEvents(stored);
        setBlockingState(computeBlockingState(stored, lt, pw, rms));
        setOverlayVisible(data[OVERLAY_VISIBLE_KEY] !== false);
        setMaxStackSize(data[MAX_STACK_SIZE_KEY] ?? DEFAULT_MAX_STACK_SIZE);
        const storedUsernames: StoredUsernames = data[USERNAMES_KEY] ?? {};
        setUsernames(storedUsernames);
        setEditChessCom(storedUsernames["chess.com"]?.username ?? "");
        setEditLichess(storedUsernames.lichess?.username ?? "");
      }
    );

    const listener = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes[STORAGE_KEY] || changes[SETTINGS_KEY]) {
        // Use functional updates to access latest state
        chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], (data) => {
          const evts = data[STORAGE_KEY] ?? [];
          const s: UserSettings | undefined = data[SETTINGS_KEY];
          const lt = s?.lossStreakThreshold ?? DEFAULT_LOSS_STREAK_THRESHOLD;
          const pw = s?.puzzleWinsToUnblock ?? DEFAULT_PUZZLE_WINS_TO_UNBLOCK;
          const rms = s?.puzzleRushMinScore ?? DEFAULT_PUZZLE_RUSH_MIN_SCORE;
          setLossThreshold(lt);
          setPuzzleWins(pw);
          setRushMinScore(rms);
          setEvents(evts);
          setBlockingState(computeBlockingState(evts, lt, pw, rms));
        });
      }
      if (changes[OVERLAY_VISIBLE_KEY]) {
        setOverlayVisible(changes[OVERLAY_VISIBLE_KEY].newValue !== false);
      }
      if (changes[USERNAMES_KEY]) {
        const updated: StoredUsernames = changes[USERNAMES_KEY].newValue ?? {};
        setUsernames(updated);
        setEditChessCom(updated["chess.com"]?.username ?? "");
        setEditLichess(updated.lichess?.username ?? "");
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const clearHistory = () => {
    chrome.storage.local.remove(STORAGE_KEY);
    setEvents([]);
    setBlockingState(computeBlockingState([], lossThreshold, puzzleWins, rushMinScore));
  };

  const toggleOverlay = () => {
    const next = !overlayVisible;
    chrome.storage.local.set({ [OVERLAY_VISIBLE_KEY]: next });
    setOverlayVisible(next);
  };

  const updateMaxStackSize = (value: number) => {
    const clamped = Math.max(5, Math.min(50, value));
    setMaxStackSize(clamped);
    chrome.storage.local.set({ [MAX_STACK_SIZE_KEY]: clamped });
  };

  const updateSettings = (lt: number, pw: number, rms: number) => {
    const settings: UserSettings = {
      lossStreakThreshold: Math.max(1, Math.min(10, lt)),
      puzzleWinsToUnblock: Math.max(1, Math.min(10, pw)),
      puzzleRushMinScore: Math.max(1, Math.min(50, rms)),
    };
    setLossThreshold(settings.lossStreakThreshold);
    setPuzzleWins(settings.puzzleWinsToUnblock);
    setRushMinScore(settings.puzzleRushMinScore);
    setBlockingState(computeBlockingState(events, settings.lossStreakThreshold, settings.puzzleWinsToUnblock, settings.puzzleRushMinScore));
    chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  };

  const saveUsername = (platform: "chess.com" | "lichess", value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return;
    const entry: UsernameEntry = { username: trimmed, source: "manual" };
    const updated: StoredUsernames = { ...usernames, [platform]: entry };
    chrome.storage.local.set({ [USERNAMES_KEY]: updated });
    setUsernames(updated);
  };

  const clearUsername = (platform: "chess.com" | "lichess") => {
    const updated: StoredUsernames = { ...usernames };
    delete updated[platform];
    chrome.storage.local.set({ [USERNAMES_KEY]: updated });
    setUsernames(updated);
    if (platform === "chess.com") setEditChessCom("");
    else setEditLichess("");
  };

  return (
    <div
      style={{
        width: 360,
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        background: "#1a1a2e",
        color: "#e0e0e0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 12px",
          borderBottom: "1px solid #2d2d44",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>
          Chess Tilt Guard
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={toggleOverlay}
            title={overlayVisible ? "Hide overlay" : "Show overlay"}
            style={{
              ...btnStyle,
              color: overlayVisible ? "#4caf50" : "#666",
              borderColor: overlayVisible
                ? "rgba(76, 175, 80, 0.4)"
                : "rgba(255,255,255,0.2)",
            }}
          >
            Overlay {overlayVisible ? "On" : "Off"}
          </button>
          <button onClick={clearHistory} style={btnStyle}>
            Clear
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 12px",
          borderBottom: "1px solid #2d2d44",
          fontSize: 11,
          color: "#888",
        }}
      >
        <span>Max events</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => updateMaxStackSize(maxStackSize - 5)}
            style={{ ...btnStyle, padding: "1px 6px", fontSize: 10 }}
          >
            &minus;
          </button>
          <span style={{ color: "#e0e0e0", minWidth: 20, textAlign: "center" }}>
            {maxStackSize}
          </span>
          <button
            onClick={() => updateMaxStackSize(maxStackSize + 5)}
            style={{ ...btnStyle, padding: "1px 6px", fontSize: 10 }}
          >
            +
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 12px",
          borderBottom: "1px solid #2d2d44",
          fontSize: 11,
          color: "#888",
        }}
      >
        <span>Losses to block</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => updateSettings(lossThreshold - 1, puzzleWins, rushMinScore)}
            style={{ ...btnStyle, padding: "1px 6px", fontSize: 10 }}
          >
            &minus;
          </button>
          <span style={{ color: "#e0e0e0", minWidth: 20, textAlign: "center" }}>
            {lossThreshold}
          </span>
          <button
            onClick={() => updateSettings(lossThreshold + 1, puzzleWins, rushMinScore)}
            style={{ ...btnStyle, padding: "1px 6px", fontSize: 10 }}
          >
            +
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 12px",
          borderBottom: "1px solid #2d2d44",
          fontSize: 11,
          color: "#888",
        }}
      >
        <span>Puzzles to unblock</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => updateSettings(lossThreshold, puzzleWins - 1, rushMinScore)}
            style={{ ...btnStyle, padding: "1px 6px", fontSize: 10 }}
          >
            &minus;
          </button>
          <span style={{ color: "#e0e0e0", minWidth: 20, textAlign: "center" }}>
            {puzzleWins}
          </span>
          <button
            onClick={() => updateSettings(lossThreshold, puzzleWins + 1, rushMinScore)}
            style={{ ...btnStyle, padding: "1px 6px", fontSize: 10 }}
          >
            +
          </button>
        </div>
      </div>

      {/* Accounts section */}
      <div style={{ borderBottom: "1px solid #2d2d44" }}>
        <button
          onClick={() => setAccountsOpen(!accountsOpen)}
          style={{
            width: "100%",
            background: "none",
            border: "none",
            color: "#888",
            fontSize: 11,
            padding: "6px 12px",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Accounts</span>
          <span style={{ fontSize: 9 }}>{accountsOpen ? "\u25B2" : "\u25BC"}</span>
        </button>
        {accountsOpen && (
          <div style={{ padding: "4px 12px 8px" }}>
            {(
              [
                {
                  platform: "chess.com" as const,
                  value: editChessCom,
                  onChange: setEditChessCom,
                  entry: usernames["chess.com"],
                  logo: CHESS_COM_LOGO,
                },
                {
                  platform: "lichess" as const,
                  value: editLichess,
                  onChange: setEditLichess,
                  entry: usernames.lichess,
                  logo: LICHESS_LOGO,
                },
              ] as const
            ).map(({ platform, value, onChange, entry, logo }) => {
              const isManual = entry?.source === "manual";
              const isAuto = entry?.source === "auto";
              const hasEdited = value.trim().toLowerCase() !== (entry?.username ?? "");

              return (
                <div key={platform} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{ flexShrink: 0, display: "flex", alignItems: "center" }}
                      dangerouslySetInnerHTML={{ __html: logo }}
                    />
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && hasEdited && value.trim()) {
                          saveUsername(platform, value);
                        }
                      }}
                      placeholder={`${platform} username`}
                      style={{
                        flex: 1,
                        background: "#16162b",
                        border: `1px solid ${isManual ? "rgba(76, 175, 80, 0.4)" : "#3d3d5c"}`,
                        borderRadius: 4,
                        color: isAuto && !hasEdited ? "#888" : "#e0e0e0",
                        fontStyle: isAuto && !hasEdited ? "italic" : "normal",
                        fontSize: 11,
                        padding: "3px 6px",
                        outline: "none",
                        minWidth: 0,
                      }}
                    />
                    {/* Show Save when user has typed a different value */}
                    {hasEdited && value.trim() ? (
                      <button
                        onClick={() => saveUsername(platform, value)}
                        style={{
                          ...btnStyle,
                          fontSize: 10,
                          padding: "2px 6px",
                          color: "#4caf50",
                          borderColor: "rgba(76, 175, 80, 0.4)",
                        }}
                      >
                        Save
                      </button>
                    ) : isManual ? (
                      <button
                        onClick={() => clearUsername(platform)}
                        style={{ ...btnStyle, fontSize: 10, padding: "2px 6px" }}
                      >
                        Clear
                      </button>
                    ) : (
                      /* Auto or empty — no button needed, but keep spacing */
                      <div style={{ width: 38 }} />
                    )}
                  </div>
                  {/* Status label */}
                  {entry && !hasEdited && (
                    <div
                      style={{
                        fontSize: 9,
                        color: isManual ? "#4caf50" : "#666",
                        marginTop: 2,
                        marginLeft: 22,
                      }}
                    >
                      {isManual ? "manual override" : "auto-detected"}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ fontSize: 9, color: "#555", marginTop: 0 }}>
              Type a username and save to override auto-detection.
            </div>
          </div>
        )}
      </div>

      <BlockingBanner state={blockingState} />

      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {events.length === 0 ? (
          <div
            style={{
              padding: 28,
              textAlign: "center",
              color: "#666",
              fontSize: 12,
            }}
          >
            No events yet. Play a game or solve a puzzle.
          </div>
        ) : (
          events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onHover={handleEventHover}
            />
          ))
        )}
      </div>
      {hoveredEvent && tooltipRect && (
        <EventTooltip event={hoveredEvent} anchorRect={tooltipRect} />
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
