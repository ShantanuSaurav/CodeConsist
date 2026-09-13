import React from 'react';
import { Challenge } from '../../types';
import { Answer, choiceOrder, wrongPositions } from '../../lib/checkAnswer';
import { CodeBlock } from '../CodeBlock';

interface Props {
  challenge: Challenge;
  answer: Answer;
  onAnswer: (answer: Answer) => void;
  checked: boolean;
  locked: boolean;
}

/**
 * Fill in the `___` holes. The inputs sit inline inside the rendered snippet,
 * so the learner reads the code exactly as it will end up.
 */
export const FillBlankChallenge: React.FC<Props> = ({ challenge, answer, onAnswer, checked, locked }) => {
  const blanks = challenge.blanks ?? [];
  // Defensive: every answer type has a different shape, and a number or null
  // here used to throw on .slice() and take the whole app down. The modal now
  // guarantees a matching shape, but this component must not be the thing that
  // crashes if that guarantee is ever broken again.
  const values = Array.isArray(answer) ? (answer as string[]).slice() : blanks.map(() => '');
  const wrong = checked ? new Set(wrongPositions(challenge, answer)) : new Set<number>();

  const setValue = (index: number, value: string) => {
    if (locked) return;
    const next = blanks.map((_, i) => (i === index ? value : values[i] ?? ''));
    onAnswer(next);
  };

  const renderBlank = (index: number) => {
    const blank = blanks[index];
    if (!blank) return <span className="blank-slot">___</span>;

    const state = checked ? (wrong.has(index) ? 'is-wrong' : 'is-right') : '';
    const width = Math.max(4, Math.min(18, (blank.answer?.length ?? 6) + 2));

    if (blank.choices?.length) {
      return (
        <select
          key={index}
          className={`blank-select ${state}`.trim()}
          value={values[index] ?? ''}
          onChange={(e) => setValue(index, e.target.value)}
          disabled={locked}
          aria-label={`Blank ${index + 1}`}
        >
          <option value="">choose…</option>
          {choiceOrder(challenge, index, blank.choices).map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        key={index}
        type="text"
        className={`blank-input ${state}`.trim()}
        value={values[index] ?? ''}
        onChange={(e) => setValue(index, e.target.value)}
        disabled={locked}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{ width: `${width}ch` }}
        aria-label={`Blank ${index + 1}`}
        placeholder="…"
      />
    );
  };

  return (
    <div className="fill-blank">
      <CodeBlock
        code={challenge.codeSnippet ?? ''}
        language={challenge.language}
        renderBlank={renderBlank}
        showLineNumbers
      />

      {checked && wrong.size > 0 && (
        <div className="blank-answers">
          <strong>Expected:</strong>{' '}
          {blanks.map((b, i) => (
            <span key={i} className={wrong.has(i) ? 'blank-answer is-wrong' : 'blank-answer'}>
              {i + 1}. <code>{b.answer}</code>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
