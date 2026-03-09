import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { StoredUsernames, UsernameEntry, UserSettings } from "./types";
import {
  MAX_STACK_SIZE_KEY,
  DEFAULT_MAX_STACK_SIZE,
  USERNAMES_KEY,
  SETTINGS_KEY,
  OVERLAY_VISIBLE_KEY,
  BOARD_SIZE_KEY,
  DEFAULT_BOARD_SIZE,
  DEFAULT_LOSS_STREAK_THRESHOLD,
  DEFAULT_PUZZLE_WINS_TO_UNBLOCK,
  DEFAULT_PUZZLE_RUSH_MIN_SCORE,
} from "./constants";
import { CHESS_COM_LOGO, LICHESS_LOGO } from "./content/shared/logos";

const btnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(255,255,255,0.2)",
  color: "#aaa",
  padding: "6px 12px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  transition: "color 0.15s, border-color 0.15s",
};

const StepperRow: React.FC<{
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
}> = ({ label, value, onDecrement, onIncrement }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "14px 24px",
      borderBottom: "1px solid #2d2d44",
      fontSize: 15,
      color: "#ccc",
    }}
  >
    <span>{label}</span>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        onClick={onDecrement}
        style={{ ...btnStyle, padding: "4px 10px", fontSize: 14, minWidth: 32 }}
      >
        &minus;
      </button>
      <span
        style={{ color: "#fff", minWidth: 28, textAlign: "center", fontWeight: 600, fontSize: 16 }}
      >
        {value}
      </span>
      <button
        onClick={onIncrement}
        style={{ ...btnStyle, padding: "4px 10px", fontSize: 14, minWidth: 32 }}
      >
        +
      </button>
    </div>
  </div>
);

const Options: React.FC = () => {
  const [maxStackSize, setMaxStackSize] = useState(DEFAULT_MAX_STACK_SIZE);
  const [lossThreshold, setLossThreshold] = useState(DEFAULT_LOSS_STREAK_THRESHOLD);
  const [puzzleWins, setPuzzleWins] = useState(DEFAULT_PUZZLE_WINS_TO_UNBLOCK);
  const [rushMinScore, setRushMinScore] = useState(DEFAULT_PUZZLE_RUSH_MIN_SCORE);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [boardSize, setBoardSize] = useState(DEFAULT_BOARD_SIZE);
  const [usernames, setUsernames] = useState<StoredUsernames>({});
  const [editChessCom, setEditChessCom] = useState("");
  const [editLichess, setEditLichess] = useState("");

  useEffect(() => {
    chrome.storage.local.get(
      [MAX_STACK_SIZE_KEY, USERNAMES_KEY, SETTINGS_KEY, OVERLAY_VISIBLE_KEY, BOARD_SIZE_KEY],
      (data) => {
        const settings: UserSettings | undefined = data[SETTINGS_KEY];
        setLossThreshold(settings?.lossStreakThreshold ?? DEFAULT_LOSS_STREAK_THRESHOLD);
        setPuzzleWins(settings?.puzzleWinsToUnblock ?? DEFAULT_PUZZLE_WINS_TO_UNBLOCK);
        setRushMinScore(settings?.puzzleRushMinScore ?? DEFAULT_PUZZLE_RUSH_MIN_SCORE);
        setMaxStackSize(data[MAX_STACK_SIZE_KEY] ?? DEFAULT_MAX_STACK_SIZE);
        setOverlayVisible(data[OVERLAY_VISIBLE_KEY] !== false);
        setBoardSize(data[BOARD_SIZE_KEY] ?? DEFAULT_BOARD_SIZE);
        const stored: StoredUsernames = data[USERNAMES_KEY] ?? {};
        setUsernames(stored);
        setEditChessCom(stored["chess.com"]?.username ?? "");
        setEditLichess(stored.lichess?.username ?? "");
      }
    );

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[SETTINGS_KEY]) {
        const s: UserSettings | undefined = changes[SETTINGS_KEY].newValue;
        setLossThreshold(s?.lossStreakThreshold ?? DEFAULT_LOSS_STREAK_THRESHOLD);
        setPuzzleWins(s?.puzzleWinsToUnblock ?? DEFAULT_PUZZLE_WINS_TO_UNBLOCK);
        setRushMinScore(s?.puzzleRushMinScore ?? DEFAULT_PUZZLE_RUSH_MIN_SCORE);
      }
      if (changes[MAX_STACK_SIZE_KEY]) {
        setMaxStackSize(changes[MAX_STACK_SIZE_KEY].newValue ?? DEFAULT_MAX_STACK_SIZE);
      }
      if (changes[OVERLAY_VISIBLE_KEY]) {
        setOverlayVisible(changes[OVERLAY_VISIBLE_KEY].newValue !== false);
      }
      if (changes[BOARD_SIZE_KEY]) {
        setBoardSize(changes[BOARD_SIZE_KEY].newValue ?? DEFAULT_BOARD_SIZE);
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
    chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  };

  const toggleOverlay = () => {
    const next = !overlayVisible;
    setOverlayVisible(next);
    chrome.storage.local.set({ [OVERLAY_VISIBLE_KEY]: next });
  };

  const updateBoardSize = (value: number) => {
    const clamped = Math.max(128, Math.min(384, value));
    setBoardSize(clamped);
    chrome.storage.local.set({ [BOARD_SIZE_KEY]: clamped });
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
        maxWidth: 640,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 15,
        background: "#1a1a2e",
        color: "#e0e0e0",
        minHeight: "100vh",
        padding: "0 0 40px",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "32px 24px 20px",
          borderBottom: "1px solid #2d2d44",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: "#fff",
          }}
        >
          Chess Tilt Guard — Settings
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#888" }}>
          Configure blocking thresholds, event limits, and linked accounts.
        </p>
      </div>

      {/* Blocking thresholds */}
      <div
        style={{
          padding: "20px 24px 6px",
          fontSize: 11,
          fontWeight: 700,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: 1.2,
        }}
      >
        Blocking
      </div>

      <StepperRow
        label="Losses to block"
        value={lossThreshold}
        onDecrement={() => updateSettings(lossThreshold - 1, puzzleWins, rushMinScore)}
        onIncrement={() => updateSettings(lossThreshold + 1, puzzleWins, rushMinScore)}
      />
      <StepperRow
        label="Puzzles to unblock"
        value={puzzleWins}
        onDecrement={() => updateSettings(lossThreshold, puzzleWins - 1, rushMinScore)}
        onIncrement={() => updateSettings(lossThreshold, puzzleWins + 1, rushMinScore)}
      />
      <StepperRow
        label="Rush score to unblock"
        value={rushMinScore}
        onDecrement={() => updateSettings(lossThreshold, puzzleWins, rushMinScore - 1)}
        onIncrement={() => updateSettings(lossThreshold, puzzleWins, rushMinScore + 1)}
      />

      {/* Events */}
      <div
        style={{
          padding: "20px 24px 6px",
          fontSize: 11,
          fontWeight: 700,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: 1.2,
        }}
      >
        Events
      </div>

      <StepperRow
        label="Max events"
        value={maxStackSize}
        onDecrement={() => updateMaxStackSize(maxStackSize - 5)}
        onIncrement={() => updateMaxStackSize(maxStackSize + 5)}
      />

      {/* Display */}
      <div
        style={{
          padding: "20px 24px 6px",
          fontSize: 11,
          fontWeight: 700,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: 1.2,
        }}
      >
        Display
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 24px",
          borderBottom: "1px solid #2d2d44",
          fontSize: 15,
          color: "#ccc",
        }}
      >
        <span>Page overlay</span>
        <button
          onClick={toggleOverlay}
          style={{
            ...btnStyle,
            padding: "6px 16px",
            color: overlayVisible ? "#4caf50" : "#888",
            borderColor: overlayVisible
              ? "rgba(76, 175, 80, 0.4)"
              : "rgba(255,255,255,0.2)",
          }}
        >
          {overlayVisible ? "On" : "Off"}
        </button>
      </div>

      <StepperRow
        label={`Board preview (${boardSize}px)`}
        value={boardSize}
        onDecrement={() => updateBoardSize(boardSize - 32)}
        onIncrement={() => updateBoardSize(boardSize + 32)}
      />

      {/* Accounts */}
      <div
        style={{
          padding: "20px 24px 6px",
          fontSize: 11,
          fontWeight: 700,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: 1.2,
        }}
      >
        Accounts
      </div>

      <div style={{ padding: "12px 24px 24px" }}>
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
            <div key={platform} style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
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
                    borderRadius: 6,
                    color: isAuto && !hasEdited ? "#888" : "#e0e0e0",
                    fontStyle: isAuto && !hasEdited ? "italic" : "normal",
                    fontSize: 14,
                    padding: "8px 10px",
                    outline: "none",
                    minWidth: 0,
                  }}
                />
                {hasEdited && value.trim() ? (
                  <button
                    onClick={() => saveUsername(platform, value)}
                    style={{
                      ...btnStyle,
                      fontSize: 13,
                      padding: "6px 12px",
                      color: "#4caf50",
                      borderColor: "rgba(76, 175, 80, 0.4)",
                    }}
                  >
                    Save
                  </button>
                ) : isManual ? (
                  <button
                    onClick={() => clearUsername(platform)}
                    style={{ ...btnStyle, fontSize: 13, padding: "6px 12px" }}
                  >
                    Clear
                  </button>
                ) : (
                  <div style={{ width: 52 }} />
                )}
              </div>
              {entry && !hasEdited && (
                <div
                  style={{
                    fontSize: 11,
                    color: isManual ? "#4caf50" : "#666",
                    marginTop: 4,
                    marginLeft: 28,
                  }}
                >
                  {isManual ? "manual override" : "auto-detected"}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
          Type a username and press Enter or Save to override auto-detection.
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
