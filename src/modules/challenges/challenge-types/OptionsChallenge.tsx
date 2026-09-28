import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { Challenge, FeedbackNote } from '@/types';
import { Answer, optionOrder } from '@/platform/grading-engine/answers';

interface Props {
  challenge: Challenge;
  answer: Answer;
  onAnswer: (answer: Answer) => void;
  checked: boolean;
  locked: boolean;
  /** The answer is shown now (tries used up). Never on a stage test. */
  reveal: boolean;
  /** "Why" notes to show under their options (see grading-engine/feedback.ts). */
  notes: FeedbackNote[];
  /** Single choice: options already picked wrong - struck through and not pickable again. */
  ruledOut?: number[];
}

/** quiz, output_prediction (single choice) and multi_select (several). */
export const OptionsChallenge: React.FC<Props> = ({ challenge, answer, onAnswer, checked, locked, reveal, notes, ruledOut = [] }) => {
  const multi = challenge.type === 'multi_select';
  const selected: number[] = multi
    ? ((answer as number[]) ?? [])
    : typeof answer === 'number'
      ? [answer]
      : [];

  const correctSet = new Set(multi ? challenge.correctIndices ?? [] : [challenge.correctIndex ?? -1]);
  // A right answer shows itself as right. A wrong one points at the correct
  // option only once the answer is revealed; before that only the learner's
  // own wrong picks are marked.
  const answeredRight = selected.length === correctSet.size && selected.every((i) => correctSet.has(i));
  const showCorrect = reveal || (checked && answeredRight);
  const out = new Set(multi ? [] : ruledOut);
  // Select-all: say that something is missing, never which.
  const missingSome = multi && checked && !answeredRight && !reveal && [...correctSet].some((i) => !selected.includes(i));

  // Display order only - `index` below stays the ORIGINAL index everywhere else.
  const order = useMemo(() => optionOrder(challenge), [challenge]);
  const noteAt = new Map(notes.map((note) => [note.position, note]));

  const isGrid = useMemo(() => {
    const opts = challenge.options ?? [];
    if (opts.length < 3 || opts.length > 4) return false;
    return opts.every((opt) => typeof opt === 'string' && opt.length <= 40 && !opt.includes('\n'));
  }, [challenge.options]);

  const toggle = (index: number) => {
    if (locked || out.has(index)) return;
    if (!multi) {
      onAnswer(index);
      return;
    }
    const current = new Set(selected);
    if (current.has(index)) current.delete(index);
    else current.add(index);
    onAnswer([...current].sort((a, b) => a - b));
  };

  return (
    <div
      className={`challenge-options ${isGrid && notes.length === 0 ? 'is-grid' : ''}`.trim()}
      role={multi ? 'group' : 'radiogroup'}
      aria-label={multi ? 'Select every correct answer' : 'Select one answer'}
    >
      {multi && (
        <p className="challenge-hint-line">Select every answer that applies.</p>
      )}

      {order.map((index, position) => {
        const option = (challenge.options ?? [])[index];
        const isSelected = selected.includes(index);
        const isCorrect = correctSet.has(index);
        const isOut = out.has(index) && !(isCorrect && showCorrect);
        const note = noteAt.get(index);
        const noteId = note ? `option-note-${challenge.id}-${index}` : undefined;

        const classes = ['option-btn'];
        if (isSelected && !checked) classes.push('selected');
        if (checked || reveal) {
          if (isCorrect && showCorrect) classes.push('correct');
          else if (isSelected && !isCorrect && checked) classes.push('incorrect');
          else if (isSelected) classes.push('selected');
          else if (checked) classes.push('muted');
        }
        if (isOut) classes.push('is-ruled-out');

        return (
          <div className={`option-item ${note ? 'has-note' : ''}`.trim()} key={index}>
            <button
              type="button"
              className={classes.join(' ')}
              onClick={() => toggle(index)}
              disabled={locked}
              aria-disabled={isOut || undefined}
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={isSelected}
              aria-describedby={noteId}
            >
              <span className={`option-letter ${multi ? 'is-box' : ''}`.trim()}>
                {multi ? (isSelected ? <Check size={12} strokeWidth={3} /> : '') : String.fromCharCode(65 + position)}
              </span>
              <span className="option-text">{option}</span>
              {isCorrect && showCorrect && <span className="option-flag">correct</span>}
              {isOut && <span className="sr-only"> (already tried)</span>}
            </button>
            {note && (
              <p id={noteId} className={`option-note is-${note.kind}`}>
                {note.text}
              </p>
            )}
          </div>
        );
      })}

      {missingSome && (
        <p className="option-missing" role="note">
          Some correct answers are missing.
        </p>
      )}
    </div>
  );
};
