/**
 * Zod schemas for challenge content. The single definition of "a valid
 * challenge": the Vite loader, the Node loader, the validator script and the
 * server all run content through this. Keep it in step with src/types.
 */
import { z } from 'zod';
import type { Challenge, ChallengeType, Difficulty, SupportedLanguage } from '@/types';

export const CHALLENGE_TYPES = [
  'quiz',
  'multi_select',
  'output_prediction',
  'fill_blank',
  'pseudocode_order',
  'debug',
  'code_runner'
] as const satisfies readonly ChallengeType[];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const satisfies readonly Difficulty[];

export const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'c',
  'cpp',
  'go',
  'sql',
  'html',
  'css',
  'bash',
  'pseudocode'
] as const satisfies readonly SupportedLanguage[];

const ID = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lowercase letters, digits and dashes');

export const TestCaseSchema = z
  .object({
    input: z.string(),
    expected: z.string(),
    hidden: z.boolean().optional()
  })
  .strict();

export const BlankSchema = z
  .object({
    answer: z.string().min(1),
    alternatives: z.array(z.string()).optional(),
    choices: z.array(z.string()).optional()
  })
  .strict();

export const WorkedExampleSchema = z
  .object({ input: z.string(), output: z.string(), explanation: z.string().optional() })
  .strict();

const Base = z
  .object({
    id: ID,
    stageId: z.string().regex(/^stage-\d+$/),
    title: z.string().min(1),
    type: z.enum(CHALLENGE_TYPES),
    difficulty: z.enum(DIFFICULTIES),
    language: z.enum(LANGUAGES),
    prompt: z.string().min(1),
    codeSnippet: z.string().optional(),
    options: z.array(z.string()).optional(),
    correctIndex: z.number().int().nonnegative().optional(),
    correctIndices: z.array(z.number().int().nonnegative()).optional(),
    blanks: z.array(BlankSchema).optional(),
    pseudocodeLines: z.array(z.string()).optional(),
    starterCode: z.string().optional(),
    entryFunction: z.string().optional(),
    testCases: z.array(TestCaseSchema).optional(),
    solutionCode: z.string().optional(),
    isStageTest: z.boolean().optional(),
    examples: z.array(WorkedExampleSchema).optional(),
    constraints: z.array(z.string()).optional(),
    hints: z.array(z.string()).optional(),
    explanation: z.string().min(1),
    xpReward: z.number().int().positive(),
    tags: z.array(z.string()).optional()
  })
  .strict();

/**
 * Per-type requirements. Anything the renderer or grader would crash on is an
 * error here, so a broken file fails the build rather than a learner's session.
 */
export const ChallengeSchema: z.ZodType<Challenge> = Base.superRefine((c, ctx) => {
  const need = (cond: boolean, message: string, path: string[] = []) => {
    if (!cond) ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  };
  switch (c.type) {
    case 'quiz':
    case 'output_prediction':
      need((c.options?.length ?? 0) >= 2, 'needs at least two options', ['options']);
      need(typeof c.correctIndex === 'number', 'needs correctIndex', ['correctIndex']);
      need((c.correctIndex ?? 0) < (c.options?.length ?? 0), 'correctIndex out of range', ['correctIndex']);
      break;
    case 'multi_select':
      need((c.options?.length ?? 0) >= 2, 'needs at least two options', ['options']);
      need((c.correctIndices?.length ?? 0) >= 1, 'needs correctIndices', ['correctIndices']);
      need((c.correctIndices ?? []).every((i) => i < (c.options?.length ?? 0)), 'correctIndices out of range', ['correctIndices']);
      break;
    case 'fill_blank': {
      const holes = (c.codeSnippet?.match(/___/g) ?? []).length;
      need((c.blanks?.length ?? 0) >= 1, 'needs blanks', ['blanks']);
      need(holes === (c.blanks?.length ?? 0), `codeSnippet has ${holes} "___" but ${c.blanks?.length ?? 0} blanks`, ['blanks']);
      break;
    }
    case 'pseudocode_order':
      need((c.pseudocodeLines?.length ?? 0) >= 3, 'needs at least three lines', ['pseudocodeLines']);
      break;
    case 'code_runner':
    case 'debug':
      need(Boolean(c.starterCode), 'needs starterCode', ['starterCode']);
      need(Boolean(c.entryFunction), 'needs entryFunction', ['entryFunction']);
      need((c.testCases?.length ?? 0) >= 1, 'needs test cases', ['testCases']);
      need(Boolean(c.solutionCode), 'needs solutionCode (the validator executes it)', ['solutionCode']);
      break;
  }
  if (c.isStageTest) {
    need(c.type === 'code_runner', 'a stage test is a code_runner', ['type']);
    need((c.examples?.length ?? 0) >= 1, 'a stage test needs worked examples', ['examples']);
  }
}) as z.ZodType<Challenge>;

export const StageMetaSchema = z
  .object({
    id: z.string().regex(/^stage-\d+$/),
    index: z.string().regex(/^\d{2}$/),
    slug: z.string().optional(),
    name: z.string().min(1),
    description: z.string().min(1),
    isPremium: z.boolean().optional(),
    icon: z.string().optional()
  })
  .strict();
