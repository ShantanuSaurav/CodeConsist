import { CodeChallenge } from './CodeChallenge';
import type { CodeTypeDefinition } from './types';

export const codeRunner: CodeTypeDefinition = {
  type: 'code_runner',
  kind: 'code',
  label: 'Write the code',
  wide: true,
  rendersSnippet: false,
  Renderer: CodeChallenge
};

export const debug: CodeTypeDefinition = {
  type: 'debug',
  kind: 'code',
  label: 'Find the bug',
  wide: true,
  rendersSnippet: false,
  Renderer: CodeChallenge
};
