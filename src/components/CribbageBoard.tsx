import React, { useState, useRef, useEffect } from 'react';
import './CribbageBoard.css';

const CRIBBAGE_MAX = 121;
const ADVANCE_OPTIONS = [1, 2, 5];
const BATCH_TIMEOUT = 2000; // 2 seconds

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

const defaultPlayerState = (): PlayerState => ({
  score: 0,
  batches: [],
  buffer: 0,
  showBubble: false,
  bufferStartTime: null,
});

const CribbageBoard: React.FC = () => {
  const [playerCount, setPlayerCount] = useState<2 | 3>(2);
  const [players, setPlayers] = useState<PlayerState[]>([defaultPlayerState(), defaultPlayerState()]);
  const [winnerIdx, setWinnerIdx] = useState<number | null>(null);
  const bufferTimeouts = useRef<(number | null)[]>([null, null, null]);
  const [lastPlayers, setLastPlayers] = useState<PlayerState[] | null>(null);
  const [resetState, setResetState] = useState<'reset' | 'undo'>('reset');
  const [resetAnim, setResetAnim] = useState<'in' | 'out' | null>(null);
  const [bubbleProgress, setBubbleProgress] = useState<number[]>([0, 0, 0]);
  const [recentlyAddedMarks, setRecentlyAddedMarks] = useState<{[col: number]: number[]}>({});

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
    setLastPlayers(null);
  };

  // Commit buffer for a column
  const commitBuffer = (idx: number) => {
    setPlayers((prev) => {
      let newPlayers = [...prev];
      let player = { ...newPlayers[idx] };
      if (player.buffer > 0) {
        let newScore = player.score + player.buffer;
        if (newScore >= CRIBBAGE_MAX) {
          newScore = CRIBBAGE_MAX;
          setWinnerIdx(idx);
        }
        const newBatchIdx = player.batches.length;
        player.batches = [...player.batches, { value: player.buffer, at: newScore }];
        player.score = newScore;
        // Animate the new label
        setRecentlyAddedMarks((prevMarks) => {
          const arr = prevMarks[idx] ? [...prevMarks[idx]] : [];
          arr.push(newBatchIdx);
          return { ...prevMarks, [idx]: arr };
        });
        setTimeout(() => {
          setRecentlyAddedMarks((prevMarks) => {
            const arr = prevMarks[idx] ? prevMarks[idx].filter(i => i !== newBatchIdx) : [];
            return { ...prevMarks, [idx]: arr };
          });
        }, 600);
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
      setResetAnim('out');
      setTimeout(() => {
        setResetState('reset');
        setResetAnim('in');
      }, 200);
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
      setLastPlayers(players.map(p => ({ ...p, batches: [...p.batches] })));
      setResetAnim('out');
      setTimeout(() => {
        setPlayers(Array(playerCount).fill(0).map(defaultPlayerState));
        setWinnerIdx(null);
        setResetState('undo');
        setResetAnim('in');
      }, 200);
    } else if (resetState === 'undo' && lastPlayers) {
      setResetAnim('out');
      setTimeout(() => {
        setPlayers(lastPlayers.map(p => ({ ...p, batches: [...p.batches] })));
        setWinnerIdx(null);
        setResetState('reset');
        setResetAnim('in');
      }, 200);
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
    const fillPercent = Math.min(displayScore, CRIBBAGE_MAX) / CRIBBAGE_MAX * 100;
    // Thought bubble gradient progress
    const bubbleProg = bubbleProgress[idx] || 0;
    return (
      <div className={`score-col${winnerIdx === idx ? ' winner' : ''}`} key={idx} style={{ borderColor: color }}>
        <div className="score-label">{displayScore}</div>
        <div className="progress-bar" style={{ borderColor: color }}>
          {lines.map((l) => (
            <div key={l} className="bar-line" style={{ bottom: `${(l / CRIBBAGE_MAX) * 100}%`, background: color, opacity: 0.5 }} />
          ))}
          {marks.map((m, i) => (
            <div
              key={i}
              className={`bar-mark${recentlyAddedMarks[idx] && recentlyAddedMarks[idx].includes(i) ? ' bar-mark-animate' : ''}`}
              style={{ bottom: `${(m.at / CRIBBAGE_MAX) * 100}%` }}
            >
              +{m.value}
            </div>
          ))}
          <div
            className="bar-fill"
            style={{ height: `${fillPercent}%`, background: `linear-gradient(180deg, ${color} 0%, #f7e7b6 100%)` }}
          />
        </div>
        <div style={{ height: 32 }} />
        <div className="score-buttons">
          <div className="button-row">
            <div className="thought-bubble-container">
              {player.showBubble && player.buffer > 0 && (
                <div
                  className="thought-bubble animate-in"
                  style={{ background: `linear-gradient(0deg, #ffe066 ${bubbleProg * 100}%, #fffbe6 ${bubbleProg * 100}%)` }}
                  onClick={() => commitBuffer(idx)}
                >
                  +{player.buffer}
                </div>
              )}
              <button onClick={() => handleAdvance(idx, 1)} disabled={winnerIdx !== null}>1</button>
            </div>
            <button onClick={() => handleAdvance(idx, 2)} disabled={winnerIdx !== null}>2</button>
            <button onClick={() => handleAdvance(idx, 5)} disabled={winnerIdx !== null}>5</button>
            <button onClick={() => handleUndo(idx)} disabled={winnerIdx !== null && idx !== winnerIdx}>Undo</button>
          </div>
        </div>
      </div>
    );
  };

  // For winner text
  const colorNames = ['Red', 'Blue', 'Green'];

  return (
    <div className="cribbage-mobile">
      <div className="top-bar">
        <button
          className={`reset-btn reset-anim-${resetAnim || 'in'}`}
          onClick={handleReset}
        >
          {resetState === 'reset' ? 'Reset' : 'Undo Reset'}
        </button>
        <div className="spacer" />
        {winnerIdx !== null && (
          <div
            className="winner-top"
            style={{ color: columnColors[winnerIdx % columnColors.length], borderColor: columnColors[winnerIdx % columnColors.length] }}
          >
            {colorNames[winnerIdx % colorNames.length]} Wins!
          </div>
        )}
        <div className="spacer" />
        <button className="toggle-btn" onClick={handleTogglePlayers}>
          {playerCount === 2 ? '2 Players' : '3 Players'}
        </button>
      </div>
      <div className="score-cols">
        {players.slice(0, playerCount).map(renderColumn)}
      </div>
    </div>
  );
};

export default CribbageBoard; 