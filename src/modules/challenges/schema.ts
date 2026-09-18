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

/**
 * Stage ids: `stage-1` … `stage-10` for the core path, `stage-c1` /
 * `stage-cpp1` for the language tracks. Lowercase, one dash, then letters
 * and digits - never something that would collide with a route segment.
 */
export const STAGE_ID = /^stage-[a-z0-9]+$/;

/**
 * Languages that have a real execution engine in this build (Node sandbox /
 * Web Worker for JavaScript, Pyodide for Python). Everything else runs only
 * through an optional Judge0 endpoint, so its stage test is answer-graded.
 */
export const EXECUTABLE_LANGUAGES = ['javascript', 'typescript', 'python'] as const satisfies readonly SupportedLanguage[];

const CodeCalloutSchema = z.object({ line: z.number().int().positive(), text: z.string().min(1) }).strict();

const ConceptExampleSchema = z
  .object({ code: z.string().min(1), language: z.enum(LANGUAGES), callouts: z.array(CodeCalloutSchema).optional() })
  .strict();

const TryItSchema = z
  .object({ instructions: z.string().min(1), starterCode: z.string().min(1), language: z.enum(LANGUAGES) })
  .strict();

/** The beginner-teaching sequence a challenge may carry (see `Concept` in src/types). */
export const ConceptSchema = z
  .object({
    id: ID,
    title: z.string().min(1),
    summary: z.string().min(1),
    intro: z.string().min(1),
    example: ConceptExampleSchema,
    why: z.string().min(1),
    secondExample: ConceptExampleSchema.optional(),
    tryIt: TryItSchema.optional(),
    explainDifferently: z.string().optional()
  })
  .strict()
  .superRefine((concept, ctx) => {
    // A callout that points past the end of its snippet renders as "Line 9" under a 3-line example.
    const check = (example: { code: string; callouts?: { line: number }[] }, path: string) => {
      const lines = example.code.split('\n').length;
      example.callouts?.forEach((c, i) => {
        if (c.line > lines) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `callout line ${c.line} is past the ${lines}-line example`, path: [path, 'callouts', i] });
        }
      });
    };
    check(concept.example, 'example');
    if (concept.secondExample) check(concept.secondExample, 'secondExample');
  });

const Base = z
  .object({
    id: ID,
    stageId: z.string().regex(STAGE_ID),
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
    tags: z.array(z.string()).optional(),
    concept: ConceptSchema.optional()
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
    // A stage test is graded by really running the learner's code. That is
    // only possible where this build has an engine; a C or C++ stage test is
    // answer-graded instead (blanks, ordering, ...), by the same
    // server-verified rules as every other lesson - never a code_runner that
    // would need a compiler nobody has configured.
    const executable = (EXECUTABLE_LANGUAGES as readonly string[]).includes(c.language);
    if (executable) {
      need(c.type === 'code_runner', 'a stage test is a code_runner', ['type']);
      need((c.examples?.length ?? 0) >= 1, 'a stage test needs worked examples', ['examples']);
    } else {
      need(c.type !== 'code_runner' && c.type !== 'debug', `${c.language} has no execution engine, so its stage test must be answer-graded`, ['type']);
    }
  }
}) as z.ZodType<Challenge>;

export const StageMetaSchema = z
  .object({
    id: z.string().regex(STAGE_ID),
    index: z.string().regex(/^\d{2}$/),
    slug: z.string().optional(),
    name: z.string().min(1),
    description: z.string().min(1),
    isPremium: z.boolean().optional(),
    icon: z.string().optional(),
    language: z.enum(LANGUAGES)
  })
  .strict();

export const LanguageTrackSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    label: z.string().min(1),
    icon: z.string().min(1),
    tagline: z.string().min(1),
    description: z.string().min(1),
    primaryLanguage: z.enum(LANGUAGES),
    stageIds: z.array(z.string().regex(STAGE_ID)).min(1)
  })
  .strict();
