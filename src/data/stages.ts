import { Stage } from '../types';

/** Stage metadata. Challenges are attached in `src/data/index.ts`. */
export type StageMeta = Omit<Stage, 'challenges' | 'state'>;

export const STAGE_META: StageMeta[] = [
  {
    id: 'stage-1',
    index: '01',
    slug: 'programming-basics',
    name: 'Programming Basics',
    icon: '🌱',
    description: 'Variables, types, operators, control flow and the mental model behind them.'
  },
  {
    id: 'stage-2',
    index: '02',
    slug: 'python-fundamentals',
    name: 'Python Fundamentals',
    icon: '🐍',
    description: 'Lists, dicts, slicing, comprehensions and idiomatic Python.'
  },
  {
    id: 'stage-3',
    index: '03',
    slug: 'data-structures',
    name: 'Data Structures',
    icon: '🧱',
    description: 'Arrays, hash maps, stacks, queues, trees and when each one earns its keep.'
  },
  {
    id: 'stage-4',
    index: '04',
    slug: 'algorithms',
    name: 'Algorithms & Problem Solving',
    icon: '🧠',
    description: 'Two pointers, sliding windows, recursion, sorting and Big-O reasoning.'
  },
  {
    id: 'stage-5',
    index: '05',
    slug: 'web-development',
    name: 'Web Development',
    icon: '🌐',
    description: 'The DOM, the event loop, fetch, CSS layout and browser behaviour.'
  },
  {
    id: 'stage-6',
    index: '06',
    slug: 'backend-apis',
    name: 'Backend & APIs',
    icon: '⚙️',
    description: 'HTTP semantics, REST design, auth, status codes and server-side errors.'
  },
  {
    id: 'stage-7',
    index: '07',
    slug: 'databases-sql',
    name: 'Databases & SQL',
    icon: '🗄️',
    description: 'Joins, indexes, normalisation, transactions and query planning.'
  },
  {
    id: 'stage-8',
    index: '08',
    slug: 'tooling-testing',
    name: 'Git, Tooling & Testing',
    icon: '🔧',
    description: 'Version control, the shell, dependency management and writing tests that hold.'
  },
  {
    id: 'stage-9',
    index: '09',
    slug: 'system-design',
    name: 'System Design',
    icon: '🏗️',
    isPremium: true,
    description: 'Caching, queues, scaling, consistency and the trade-offs behind them.'
  },
  {
    id: 'stage-10',
    index: '10',
    slug: 'real-projects',
    name: 'Build Real Projects',
    icon: '🚀',
    isPremium: true,
    description: 'Shipping: CI/CD, observability, security hardening and production readiness.'
  }
];
