import React, { useState } from 'react';
import { Challenge } from '@/types';
import { Answer, moveItem } from '@/platform/grading-engine/answers';
import { wrongPositions } from './registry';
import { tokenizeLine } from '@/ui/code/highlight';

interface Props {
  challenge: Challenge;
  answer: Answer;
  onAnswer: (answer: Answer) => void;
  checked: boolean;
  locked: boolean;
}

/**
 * Reorder the pseudocode.
 *
 * Every line is on screen at once - the whole point of the exercise is seeing
 * the shape of the algorithm. Reordering works three ways so it is usable on a
 * phone, with a mouse, and with a keyboard alone: drag, the arrow buttons, and
 * Alt+Up / Alt+Down while a row is focused.
 */
export const PseudocodeOrderChallenge: React.FC<Props> = ({
  challenge,
  answer,
  onAnswer,
  checked,
  locked
}) => {
  // Defensive, for the same reason as FillBlankChallenge: an answer of the
  // wrong shape must degrade to an empty list, never throw mid-render.
  const lines = Array.isArray(answer) ? (answer as string[]) : [];
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const wrong = checked ? new Set(wrongPositions(challenge, answer)) : new Set<number>();

  const move = (from: number, to: number) => {
    if (locked || to < 0 || to >= lines.length) return;
    onAnswer(moveItem(lines, from, to));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, index: number) => {
    if (locked) return;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const target = index + (e.key === 'ArrowUp' ? -1 : 1);
      move(index, target);
      // Keep focus on the row that moved. React nulls e.currentTarget once the
      // handler returns, so the list must be captured NOW, not inside the rAF
      // - reading it there threw and the focus restore silently never ran.
      const list = e.currentTarget.parentElement;
      requestAnimationFrame(() => {
        const next = list?.children[Math.max(0, Math.min(lines.length - 1, target))] as HTMLElement | undefined;
        next?.focus();
      });
    }
  };

  return (
    <div className="pseudo-order">
      <p className="challenge-hint-line">
        Drag the lines into order, use the arrows, or focus a line and press Alt with the up and
        down arrow keys.
      </p>

      <ol className="pseudo-list">
        {lines.map((line, index) => {
          const indent = line.match(/^\s*/)?.[0].length ?? 0;
          const classes = ['pseudo-row'];
          if (dragIndex === index) classes.push('is-dragging');
          if (overIndex === index && dragIndex !== null && dragIndex !== index) classes.push('is-over');
          if (checked) classes.push(wrong.has(index) ? 'is-wrong' : 'is-right');

          return (
            <li
              key={`${line}-${index}`}
              className={classes.join(' ')}
              tabIndex={locked ? -1 : 0}
              draggable={!locked}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onDragStart={() => setDragIndex(index)}
              onDragEnter={() => setOverIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              aria-label={`Line ${index + 1} of ${lines.length}: ${line.trim()}`}
            >
              <span className="pseudo-handle" aria-hidden="true">
                ⠿
              </span>
              <span className="pseudo-step">{index + 1}</span>
              <code className="pseudo-code" style={{ paddingLeft: `${indent * 0.5}rem` }}>
                {tokenizeLine(line.trimStart(), challenge.language ?? 'pseudocode').map((token, i) => (
                  <span className={`tok tok-${token.kind}`} key={i}>
                    {token.text}
                  </span>
                ))}
              </code>

              <span className="pseudo-move">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={locked || index === 0}
                  aria-label={`Move line ${index + 1} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={locked || index === lines.length - 1}
                  aria-label={`Move line ${index + 1} down`}
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      {checked && wrong.size > 0 && (
        <div className="pseudo-solution">
          <strong>The correct order:</strong>
          <ol>
            {(challenge.pseudocodeLines ?? []).map((line, i) => (
              <li key={i}>
                <code>{line}</code>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};
