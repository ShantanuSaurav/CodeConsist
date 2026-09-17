import type React from 'react';
import type { Challenge, ChallengeType, ExecutionResult } from '@/types';
import type { Answer } from '@/platform/grading-engine/answers';

/** Props every answer-style renderer (quiz, blanks, ordering) receives. */
export interface AnswerRendererProps {
  challenge: Challenge;
  answer: Answer;
  onAnswer: (answer: Answer) => void;
  checked: boolean;
  locked: boolean;
}

/** Props for code-style renderers (write the code, fix the bug). */
export interface CodeRendererProps {
  challenge: Challenge;
  code: string;
  onCodeChange: (code: string) => void;
  onRun: () => void;
  isRunning: boolean;
  progressMessage: string;
  result: ExecutionResult | null;
  locked: boolean;
  showSolution: boolean;
  onReset: () => void;
}

interface CommonDefinition {
  type: ChallengeType;
  /** Shown in the modal header. */
  label: string;
  /** Wide modal (editor + tests) or the standard width. */
  wide: boolean;
  /** True when the renderer draws the code snippet itself (fill_blank puts inputs inside it). */
  rendersSnippet: boolean;
}

/** A type whose answer is a value the learner picks or arranges. */
export interface AnswerTypeDefinition extends CommonDefinition {
  kind: 'answer';
  Renderer: React.ComponentType<AnswerRendererProps>;
  /** The answer a fresh attempt starts from. */
  emptyAnswer: (challenge: Challenge) => Answer;
  /** Can this answer be checked yet? */
  isComplete: (challenge: Challenge, answer: Answer) => boolean;
  /** Is it right? (Instant feedback - the server re-checks before paying XP.) */
  check: (challenge: Challenge, answer: Answer) => boolean;
  /** Which positions are wrong, so feedback can point at them. */
  wrongPositions: (challenge: Challenge, answer: Answer) => number[];
  /** Number keys 1-9 pick an option, if the renderer displays options. */
  supportsNumberKeys: boolean;
}

/** A type solved by running code against test cases. */
export interface CodeTypeDefinition extends CommonDefinition {
  kind: 'code';
  Renderer: React.ComponentType<CodeRendererProps>;
}

export type ChallengeTypeDefinition = AnswerTypeDefinition | CodeTypeDefinition;
