import React, { useState, useRef, useEffect } from 'react';
import './CribbageBoard.css';
import Confetti from 'react-confetti';

const CRIBBAGE_MAX = 121;
const ADVANCE_OPTIONS = [1, 2, 5];
const BATCH_TIMEOUT = 2000; // 2 seconds
const STORAGE_KEY = 'cribbage-game-state';

// Wake Lock API types
interface WakeLockSentinel {
  release: () => Promise<void>;
}

interface WakeLock {
  request: (type: 'screen') => Promise<WakeLockSentinel>;
}

declare global {
  interface Navigator {
    wakeLock: WakeLock | undefined;
  }
}

interface Batch {
  value: number;
  at: number; // score after batch
}

interface PlayerState {
  score: number;
  batches: Batch[];
  buffer: number;
  showBubble: boolean;
  bufferStartTime?: number | null;
}

interface GameState {
  playerCount: 2 | 3;
  players: PlayerState[];
  winnerIdx: number | null;
}

const defaultPlayerState = (): PlayerState => ({
  score: 0,
  batches: [],
  buffer: 0,
  showBubble: false,
  bufferStartTime: null,
});

const loadGameState = (): GameState | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const state = JSON.parse(saved);
    // Ensure the loaded state has all required fields
    if (!state.playerCount || !state.players || state.winnerIdx === undefined) return null;
    return state;
  } catch (e) {
    console.error('Failed to load game state:', e);
    return null;
  }
};

const saveGameState = (state: GameState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save game state:', e);
  }
};

const CribbageBoard: React.FC = () => {
  // Load initial state from localStorage or use defaults
  const savedState = loadGameState();
  const [playerCount, setPlayerCount] = useState<2 | 3>(savedState?.playerCount || 2);
  const [players, setPlayers] = useState<PlayerState[]>(
    savedState?.players || [defaultPlayerState(), defaultPlayerState()]
  );
  const [winnerIdx, setWinnerIdx] = useState<number | null>(savedState?.winnerIdx || null);
  const bufferTimeouts = useRef<(number | null)[]>([null, null, null]);
  const [lastGameState, setLastGameState] = useState<GameState | null>(null);
  const [resetState, setResetState] = useState<'reset' | 'undo'>('reset');
  const [bubbleProgress, setBubbleProgress] = useState<number[]>([0, 0, 0]);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(true);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });

  // Save game state whenever it changes
  useEffect(() => {
    saveGameState({
      playerCount,
      players,
      winnerIdx,
    });
  }, [playerCount, players, winnerIdx]);

  // Animate the countdown gradient for each bubble
  useEffect(() => {
    const interval = setInterval(() => {
      setBubbleProgress((prev) =>
        players.map((player, idx) => {
          if (player.showBubble && player.buffer > 0 && player.bufferStartTime) {
            const elapsed = Date.now() - player.bufferStartTime;
            return Math.min(1, elapsed / BATCH_TIMEOUT);
          }
          return 0;
        })
      );
    }, 10);
    return () => clearInterval(interval);
  }, [players]);

  // Toggle wake lock
  const toggleWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          setWakeLockActive(false);
        } else {
          wakeLockRef.current = await navigator.wakeLock?.request('screen');
          setWakeLockActive(true);
        }
      }
    } catch (err) {
      console.error('Failed to toggle wake lock:', err);
      setWakeLockActive(false);
    }
  };

  // Request wake lock when component mounts
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock?.request('screen');
          setWakeLockActive(true);
        }
      } catch (err) {
        console.error('Failed to request wake lock:', err);
        setWakeLockActive(false);
      }
    };

    requestWakeLock();

    // Release wake lock when component unmounts
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(console.error);
      }
    };
  }, []);

  // Handle player count toggle
  const handleTogglePlayers = () => {
    if (playerCount === 2) {
      setPlayerCount(3);
      setPlayers((prev) => [...prev, defaultPlayerState()]);
    } else {
      setPlayerCount(2);
      setPlayers((prev) => prev.slice(0, 2));
    }
    setWinnerIdx(null);
    setResetState('reset');
    setLastGameState(null);
  };

  // Commit buffer for a column
  const commitBuffer = (idx: number) => {
    setPlayers((prev) => {
      let newPlayers = [...prev];
      let player = { ...newPlayers[idx] };
      if (player.buffer > 0) {
        let newScore = player.score + player.buffer;
        if (newScore >= CRIBBAGE_MAX) {
          setWinnerIdx(idx);
        }
        const newBatchIdx = player.batches.length;
        player.batches = [...player.batches, { value: player.buffer, at: newScore }];
        player.score = newScore;
      }
      player.buffer = 0;
      player.showBubble = false;
      player.bufferStartTime = null;
      newPlayers[idx] = player;
      return newPlayers;
    });
    if (bufferTimeouts.current[idx]) clearTimeout(bufferTimeouts.current[idx]!);
  };

  // Handle advance button
  const handleAdvance = (idx: number, value: number) => {
    if (winnerIdx !== null) return;
    // Commit any other column's buffer immediately
    setPlayers((prev) => {
      let newPlayers = [...prev];
      for (let i = 0; i < newPlayers.length; i++) {
        if (i !== idx && newPlayers[i].buffer > 0 && newPlayers[i].showBubble) {
          let player = { ...newPlayers[i] };
          let newScore = player.score + player.buffer;
          if (newScore >= CRIBBAGE_MAX) {
            newScore = CRIBBAGE_MAX;
            setWinnerIdx(i);
          }
          player.batches = [...player.batches, { value: player.buffer, at: newScore }];
          player.score = newScore;
          player.buffer = 0;
          player.showBubble = false;
          player.bufferStartTime = null;
          newPlayers[i] = player;
          if (bufferTimeouts.current[i]) clearTimeout(bufferTimeouts.current[i]!);
        }
      }
      // Now process the current column
      let player = { ...newPlayers[idx] };
      player.bufferStartTime = Date.now();
      player.buffer += value;
      player.showBubble = true;
      newPlayers[idx] = player;
      return newPlayers;
    });
    // Reset bubble progress for this column
    setBubbleProgress((prev) => {
      const arr = [...prev];
      arr[idx] = 0;
      return arr;
    });
    // Reset buffer timeout for this column
    if (bufferTimeouts.current[idx]) clearTimeout(bufferTimeouts.current[idx]!);
    bufferTimeouts.current[idx] = window.setTimeout(() => {
      commitBuffer(idx);
    }, BATCH_TIMEOUT);
    // If in undo reset state, revert to reset on first score
    if (resetState === 'undo') {
      setResetState('reset');
    }
  };

  // Handle undo
  const handleUndo = (idx: number) => {
    setPlayers((prev) => {
      let newPlayers = [...prev];
      let player = { ...newPlayers[idx] };
      // If buffer is active, just clear it and hide bubble
      if (player.buffer > 0) {
        player.buffer = 0;
        player.showBubble = false;
        player.bufferStartTime = null;
        if (bufferTimeouts.current[idx]) clearTimeout(bufferTimeouts.current[idx]!);
      } else if (player.batches.length > 0) {
        // Undo last batch
        const last = player.batches[player.batches.length - 1];
        player.score = Math.max(0, player.score - last.value);
        player.batches = player.batches.slice(0, -1);
      }
      newPlayers[idx] = player;
      return newPlayers;
    });
    setWinnerIdx(null);
  };

  // Handle reset and undo reset
  const handleReset = () => {
    if (resetState === 'reset') {
      setLastGameState({
        playerCount: playerCount,
        players: players.map(p => ({ ...p, batches: [...p.batches] })),
        winnerIdx: winnerIdx,
      });
      setPlayers(Array(playerCount).fill(0).map(defaultPlayerState));
      setWinnerIdx(null);
      setResetState('undo');
    } else if (resetState === 'undo' && lastGameState) {
      setPlayerCount(lastGameState.playerCount);
      setPlayers(lastGameState.players.map(p => ({ ...p, batches: [...p.batches] })));
      setWinnerIdx(lastGameState.winnerIdx);
      setResetState('reset');
    }
  };

  // Render progress bar column
  const columnColors = ['#e74c3c', '#3498db', '#27ae60'];
  const renderColumn = (player: PlayerState, idx: number) => {
    // Calculate all marks (batches only)
    let marks: { value: number; at: number }[] = [];
    let running = 0;
    for (const b of player.batches) {
      running += b.value;
      marks.push({ value: b.value, at: running });
    }
    // Mark lines every 10
    const lines = [];
    for (let i = 10; i < CRIBBAGE_MAX; i += 10) {
      lines.push(i);
    }
    const color = columnColors[idx % columnColors.length];
    const displayScore = player.score + player.buffer;
    const fillPercent = Math.min(player.score, CRIBBAGE_MAX) / CRIBBAGE_MAX * 100;
    const previewPercent = Math.min(displayScore, CRIBBAGE_MAX) / CRIBBAGE_MAX * 100;
    const bufferActive = player.buffer > 0 && player.showBubble;
    const bubbleProg = bubbleProgress[idx] || 0;
    return (
      <div className={`score-col${winnerIdx === idx ? ' winner' : ''}`} key={idx} style={{ borderColor: color }} ref={el => columnRefs.current[idx] = el}>
        <div className="score-label">{displayScore}</div>
        <div className="progress-bar" style={{ borderColor: color, position: 'relative' }}>
          {lines.map((l) => (
            <div key={l} className="bar-line" style={{ bottom: `${(l / CRIBBAGE_MAX) * 100}%`, background: color, opacity: 0.5 }} />
          ))}
          {/* Main fill */}
          <div
            className="bar-fill"
            style={{ height: `${fillPercent}%`, background: `linear-gradient(180deg, ${color} 0%, #f7e7b6 100%)` }}
          />
          {/* Preview buffer extension */}
          {bufferActive && (
            <div
              className="bar-preview-fill"
              style={{
                height: `${previewPercent - fillPercent}%`,
                bottom: `${fillPercent}%`,
                background: `linear-gradient(0deg, ${color} 0%, #ffffff 100%)`,
                opacity: 0.95,
                position: 'absolute',
                left: 0,
                width: '100%',
                zIndex: 3,
                transition: 'height 0.2s',
                cursor: 'pointer',
              }}
              onClick={() => commitBuffer(idx)}
            >
              {/* Animated overlay for timer */}
              <div
                className="bar-preview-timer"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: `${(1 -bubbleProg) * 100}%`,
                  background: 'rgba(255,255,255,0.5)',
                  zIndex: 5,
                  pointerEvents: 'none',
                  transition: 'height 0.1s',
                }}
              />
            </div>
          )}
        </div>
        <div style={{ height: 32 }} />
        <div className="score-buttons">
          <div className="button-row" style={{ position: 'relative' }}>
            {bufferActive && (
              <div
                className="bar-preview-label"
                style={{
                  color: color,
                  borderColor: color,
                  position: 'absolute',
                  top: '-40px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                }}
                onClick={() => commitBuffer(idx)}
              >
                +{player.buffer}
              </div>
            )}
            <button onClick={() => handleAdvance(idx, 1)} disabled={winnerIdx !== null}>1</button>
            <button onClick={() => handleAdvance(idx, 2)} disabled={winnerIdx !== null}>2</button>
            <button onClick={() => handleAdvance(idx, 5)} disabled={winnerIdx !== null}>5</button>
            <button onClick={() => handleUndo(idx)} disabled={winnerIdx !== null && idx !== winnerIdx}>Undo</button>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (containerRef.current) {
      setContainerDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }
  }, [playerCount, players]); // Recalculate on player count or score changes

  return (
    <div className="cribbage-mobile" ref={containerRef}>
      {winnerIdx !== null && containerDimensions.width > 0 && containerDimensions.height > 0 && columnRefs.current[winnerIdx] && (
        <Confetti
          width={containerDimensions.width}
          height={containerDimensions.height}
          run={winnerIdx !== null}
          numberOfPieces={winnerIdx !== null ? 200 : 0}
          confettiSource={{
            x: columnRefs.current[winnerIdx]?.getBoundingClientRect().left + columnRefs.current[winnerIdx]?.getBoundingClientRect().width / 2 || 0,
            y: columnRefs.current[winnerIdx]?.getBoundingClientRect().top + columnRefs.current[winnerIdx]?.getBoundingClientRect().height / 2 || 0,
            w: 0,
            h: 0,
          }}
          recycle={true}
          colors={[columnColors[winnerIdx % columnColors.length]]}
        />
      )}
      <div className="top-bar">
        <button 
          className="wake-lock-btn" 
          onClick={toggleWakeLock}
          title={wakeLockActive ? "Screen will stay awake" : "Screen may sleep"}
        >
          {wakeLockActive ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
        </button>
        <button className="toggle-btn" onClick={handleTogglePlayers}>
          {playerCount === 2 ? '2 Players' : '3 Players'}
        </button>
        <button
          className={`reset-btn reset-anim-${resetState === 'reset' ? 'in' : 'out'}`}
          onClick={handleReset}
        >
          {resetState === 'reset' ? 'Reset' : 'Undo Reset'}
        </button>
      </div>
      <div className="score-cols">
        {players.slice(0, playerCount).map(renderColumn)}
      </div>
    </div>
  );
};

export default CribbageBoard; 