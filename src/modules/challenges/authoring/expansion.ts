import type { Challenge, Difficulty, SupportedLanguage } from '@/types';

export type QuestionRow = readonly [
  number: number,
  title: string,
  topic: string,
  difficulty: Difficulty,
  question: string,
  answers: readonly [string, string, string, string],
  explanation: string,
  hint: string
];

export function questionBatch(
  stageId: string,
  batch: string,
  language: SupportedLanguage,
  subject: string,
  type: 'quiz' | 'output_prediction',
  rows: readonly QuestionRow[]
): Challenge[] {
  return rows.map(([number, title, topic, difficulty, question, answers, explanation, hint]) => {
    const correctIndex = (number - 1) % answers.length;
    const options = [...answers];
    options.splice(0, 1);
    options.splice(correctIndex, 0, answers[0]);
    return {
      id: `${stageId}-${batch}${String(number).padStart(2, '0')}`,
      stageId,
      title,
      type,
      difficulty,
      language,
      prompt: type === 'quiz' ? question : 'What exactly does this program print? Ignore the final newline.',
      ...(type === 'output_prediction' ? { codeSnippet: question } : {}),
      options,
      correctIndex,
      explanation,
      hints: [hint],
      xpReward: { easy: 40, medium: 70, hard: 110 }[difficulty],
      tags: [topic, `${subject}-practice`]
    };
  });
}

export function programBatch(
  stageId: string,
  language: 'c' | 'cpp',
  rows: readonly QuestionRow[]
): Challenge[] {
  const programs = rows.map(([number, title, topic, difficulty, body, answers, explanation, hint]): QuestionRow => [
    number, title, topic, difficulty,
    `${programHeaders(language, body)}\n\nint main(void) {\n${body.split('\n').map(line => `  ${line}`).join('\n')}\n  return 0;\n}`,
    answers, explanation, hint
  ]);
  return questionBatch(stageId, 'b', language, language === 'c' ? 'c-fundamentals' : 'cpp-fundamentals', 'output_prediction', programs);
}

function programHeaders(language: 'c' | 'cpp', body: string): string {
  const dependencies = language === 'c'
    ? [['strlen', 'string.h']]
    : [['std::string', 'string'], ['std::vector', 'vector'], ['std::sort', 'algorithm'], ['std::accumulate', 'numeric'], ['std::set', 'set'], ['std::map', 'map']];
  return [language === 'c' ? 'stdio.h' : 'iostream', ...dependencies.filter(([symbol]) => body.includes(symbol)).map(([, header]) => header)]
    .map(header => `#include <${header}>`).join('\n');
}
