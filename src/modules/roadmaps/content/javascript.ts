import type { Roadmap } from '@/types';
import { MDN, book, docs, link, practice, roadmapSh } from './helpers';

const JSI = 'https://javascript.info';

export const roadmap: Roadmap = {
  slug: 'javascript',
  order: 5,
  title: 'JavaScript',
  kind: 'skill',
  icon: '🟨',
  description: 'The language of the browser and of Node: from variables and coercion to closures, prototypes, async and modules.',
  roadmapShUrl: 'https://roadmap.sh/javascript',
  sections: [
    {
      id: 'basics',
      title: 'Language basics',
      nodes: [
        {
          id: 'variables',
          title: 'Variables: let, const, var and hoisting',
          description: 'Block scope, the temporal dead zone, and why var still bites in old code.',
          stageId: 'stage-1',
          tags: ['let', 'var', 'hoisting', 'scope'],
          resources: [docs('Grammar and types (MDN)', `${MDN}/Web/JavaScript/Guide/Grammar_and_types`), link('Variables (javascript.info)', `${JSI}/variables`)]
        },
        {
          id: 'types-coercion',
          title: 'Types, typeof and coercion',
          description: 'Seven primitives plus objects; how + and == convert operands; truthy and falsy values.',
          stageId: 'stage-1',
          tags: ['typeof', 'coercion', 'equality', 'truthiness'],
          resources: [docs('Data structures (MDN)', `${MDN}/Web/JavaScript/Data_structures`), docs('Equality comparisons (MDN)', `${MDN}/Web/JavaScript/Equality_comparisons_and_sameness`), link('Type conversions (javascript.info)', `${JSI}/type-conversions`)]
        },
        {
          id: 'control-flow',
          title: 'Control flow and loops',
          description: 'if/else, switch fall-through, the ternary, for/while/for-of/for-in, break and continue.',
          stageId: 'stage-1',
          tags: ['conditionals', 'loops', 'switch', 'ternary'],
          resources: [docs('Control flow and error handling (MDN)', `${MDN}/Web/JavaScript/Guide/Control_flow_and_error_handling`), docs('Loops and iteration (MDN)', `${MDN}/Web/JavaScript/Guide/Loops_and_iteration`)]
        },
        {
          id: 'functions',
          title: 'Functions, parameters and arrow functions',
          description: 'Declarations vs expressions, default and rest parameters, arrow functions and what they do to this.',
          stageId: 'stage-1',
          tags: ['functions', 'parameters', 'return'],
          resources: [docs('Functions (MDN)', `${MDN}/Web/JavaScript/Guide/Functions`), link('Arrow functions (javascript.info)', `${JSI}/arrow-functions-basics`)]
        },
        {
          id: 'strings',
          title: 'Strings and template literals',
          description: 'Immutable strings, the everyday methods, and interpolation with backticks.',
          stageId: 'stage-1',
          tags: ['strings', 'template-literals'],
          resources: [docs('String (MDN)', `${MDN}/Web/JavaScript/Reference/Global_Objects/String`), docs('Template literals (MDN)', `${MDN}/Web/JavaScript/Reference/Template_literals`)]
        }
      ]
    },
    {
      id: 'data',
      title: 'Data structures',
      nodes: [
        {
          id: 'arrays',
          title: 'Arrays and iteration methods',
          description: 'map, filter, reduce, find, some/every, sort with a comparator - and which methods mutate.',
          stageId: 'stage-1',
          tags: ['arrays', 'immutability', 'sorting'],
          resources: [docs('Array (MDN)', `${MDN}/Web/JavaScript/Reference/Global_Objects/Array`), link('Array methods (javascript.info)', `${JSI}/array-methods`)]
        },
        {
          id: 'objects',
          title: 'Objects, references and destructuring',
          description: 'Property access, shallow vs deep copies, spread, and destructuring with defaults.',
          stageId: 'stage-1',
          tags: ['destructuring', 'objects', 'references'],
          resources: [docs('Working with objects (MDN)', `${MDN}/Web/JavaScript/Guide/Working_with_objects`), docs('Destructuring (MDN)', `${MDN}/Web/JavaScript/Reference/Operators/Destructuring`)]
        },
        {
          id: 'map-set',
          title: 'Map, Set, WeakMap',
          description: 'Real hash maps and sets with any key type, insertion order, and O(1) membership.',
          stageId: 'stage-3',
          tags: ['hash-map', 'map', 'set'],
          resources: [docs('Keyed collections (MDN)', `${MDN}/Web/JavaScript/Guide/Keyed_collections`), link('Map and Set (javascript.info)', `${JSI}/map-set`)]
        },
        {
          id: 'json',
          title: 'JSON',
          description: 'stringify and parse, what survives the round trip (not Dates, not undefined), and safe parsing.',
          stageId: 'stage-10',
          tags: ['json'],
          resources: [docs('JSON (MDN)', `${MDN}/Web/JavaScript/Reference/Global_Objects/JSON`)]
        }
      ]
    },
    {
      id: 'deeper',
      title: 'How the language works',
      nodes: [
        {
          id: 'closures',
          title: 'Scope and closures',
          description: 'Lexical scope, functions that remember their environment, and the loop-variable trap.',
          stageId: 'stage-1',
          tags: ['closures', 'scope'],
          resources: [docs('Closures (MDN)', `${MDN}/Web/JavaScript/Closures`), link('Variable scope, closure (javascript.info)', `${JSI}/closure`)]
        },
        {
          id: 'this-prototypes',
          title: 'this, prototypes and classes',
          description: 'How this is bound, the prototype chain, class syntax as sugar, and inheritance.',
          resources: [docs('Inheritance and the prototype chain (MDN)', `${MDN}/Web/JavaScript/Inheritance_and_the_prototype_chain`), link('Prototypes, inheritance (javascript.info)', `${JSI}/prototypes`), docs('Classes (MDN)', `${MDN}/Web/JavaScript/Reference/Classes`)]
        },
        {
          id: 'errors',
          title: 'Errors and try/catch',
          description: 'Throwing Error objects, catching close to where you can handle, finally for cleanup, custom error types.',
          stageId: 'stage-1',
          tags: ['try-catch', 'error-handling'],
          resources: [link('Error handling, try...catch (javascript.info)', `${JSI}/try-catch`), docs('Error (MDN)', `${MDN}/Web/JavaScript/Reference/Global_Objects/Error`)]
        },
        {
          id: 'iterators-generators',
          title: 'Iterators and generators',
          description: 'The iteration protocol behind for-of and spread, and functions that yield values lazily.',
          optional: true,
          resources: [docs('Iterators and generators (MDN)', `${MDN}/Web/JavaScript/Guide/Iterators_and_generators`)]
        }
      ]
    },
    {
      id: 'async',
      title: 'Asynchronous JavaScript',
      nodes: [
        {
          id: 'event-loop',
          title: 'The event loop, tasks and microtasks',
          description: 'One thread, a task queue, and a microtask queue that drains between tasks - why promise callbacks beat setTimeout(0).',
          stageId: 'stage-5',
          tags: ['event-loop', 'microtasks', 'settimeout'],
          resources: [docs('The event loop (MDN)', `${MDN}/Web/JavaScript/Event_loop`), link('Event loop: microtasks and macrotasks (javascript.info)', `${JSI}/event-loop`)]
        },
        {
          id: 'promises',
          title: 'Promises and async/await',
          description: 'Chaining, error propagation, Promise.all / allSettled / race / any, and the forgotten-await bug.',
          stageId: 'stage-5',
          tags: ['promises', 'async-await', 'allsettled'],
          resources: [docs('Using promises (MDN)', `${MDN}/Web/JavaScript/Guide/Using_promises`), link('Promises, async/await (javascript.info)', `${JSI}/async`)]
        },
        {
          id: 'fetch',
          title: 'fetch and the network',
          description: 'Requests and responses, checking res.ok, reading bodies once, and AbortController for cancellation.',
          stageId: 'stage-5',
          tags: ['fetch', 'http'],
          resources: [docs('Using the Fetch API (MDN)', `${MDN}/Web/API/Fetch_API/Using_Fetch`)]
        }
      ]
    },
    {
      id: 'ecosystem',
      title: 'Ecosystem',
      nodes: [
        {
          id: 'modules',
          title: 'Modules',
          description: 'import/export, default vs named exports, dynamic import, and the CommonJS legacy in Node.',
          resources: [docs('JavaScript modules (MDN)', `${MDN}/Web/JavaScript/Guide/Modules`), link('Modules (javascript.info)', `${JSI}/modules-intro`)]
        },
        {
          id: 'node',
          title: 'Node.js',
          description: 'Running JavaScript outside the browser: the fs, path, http and child_process modules, npm and the event loop on a server.',
          resources: [docs('Node.js - Learn', 'https://nodejs.org/en/learn'), link('nodejs roadmap on roadmap.sh', 'https://roadmap.sh/nodejs', 'roadmap')]
        },
        {
          id: 'typescript',
          title: 'TypeScript',
          description: 'Types on top of JavaScript: interfaces, unions, generics, narrowing, and strict mode.',
          resources: [docs('TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/intro.html'), link('typescript roadmap on roadmap.sh', 'https://roadmap.sh/typescript', 'roadmap')]
        },
        {
          id: 'testing',
          title: 'Testing JavaScript',
          description: 'Vitest or Jest for units, Testing Library for components, Playwright for the browser.',
          stageId: 'stage-8',
          tags: ['testing'],
          resources: [docs('Vitest', 'https://vitest.dev/guide/'), docs('Jest', 'https://jestjs.io/docs/getting-started')]
        },
        {
          id: 'js-more',
          title: 'Keep going',
          description: 'Regular expressions, the Intl API, Web Workers, memory and performance - and the full community roadmap.',
          resources: [roadmapSh('javascript'), book('Eloquent JavaScript (free book)', 'https://eloquentjavascript.net/'), book('You Don\'t Know JS Yet (free)', 'https://github.com/getify/You-Dont-Know-JS'), practice('CodeConsist Stage 01 - Programming Basics', '/dashboard/learn')]
        }
      ]
    }
  ]
};
