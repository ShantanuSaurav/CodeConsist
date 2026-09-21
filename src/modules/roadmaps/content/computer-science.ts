import type { Roadmap } from '@/types';
import { book, course, docs, link, practice, roadmapSh } from './helpers';

export const roadmap: Roadmap = {
  slug: 'computer-science',
  order: 8,
  title: 'Computer Science & DSA',
  kind: 'skill',
  icon: '🧠',
  description: 'Data structures, algorithms and the fundamentals underneath every language and framework.',
  roadmapShUrl: 'https://roadmap.sh/computer-science',
  sections: [
    {
      id: 'analysis',
      title: 'Analysis',
      nodes: [
        {
          id: 'big-o',
          title: 'Big-O and complexity',
          description: 'Counting how cost grows with input: O(1), O(log n), O(n), O(n log n), O(n²), and amortised analysis.',
          stageId: 'stage-4',
          tags: ['big-o', 'complexity', 'amortised'],
          resources: [link('Big-O Cheat Sheet', 'https://www.bigocheatsheet.com/'), course('MIT 6.006 Introduction to Algorithms', 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/')]
        },
        {
          id: 'recursion',
          title: 'Recursion',
          description: 'Base cases, the call stack, trusting the recursive call, and converting to iteration.',
          stageId: 'stage-1',
          tags: ['recursion', 'base-case'],
          resources: [link('Recursion (javascript.info)', 'https://javascript.info/recursion'), practice('CodeConsist Stage 04 - Algorithms', '/dashboard/learn')]
        }
      ]
    },
    {
      id: 'structures',
      title: 'Data structures',
      nodes: [
        {
          id: 'arrays-strings',
          title: 'Arrays and strings',
          description: 'Dynamic arrays, amortised append, in-place operations and string immutability.',
          stageId: 'stage-3',
          tags: ['arrays', 'dynamic-array', 'strings'],
          resources: [practice('VisuAlgo - visualising data structures', 'https://visualgo.net/en')]
        },
        {
          id: 'hash-maps',
          title: 'Hash maps and sets',
          description: 'Hash functions, collisions and chaining, O(1) lookup, and the counting/two-sum patterns.',
          stageId: 'stage-3',
          tags: ['hash-map', 'set', 'collisions', 'two-sum'],
          resources: [link('Hash table (Wikipedia)', 'https://en.wikipedia.org/wiki/Hash_table'), practice('VisuAlgo - hash table', 'https://visualgo.net/en/hashtable')]
        },
        {
          id: 'linked-lists',
          title: 'Linked lists',
          description: 'Nodes and pointers, O(1) insert at a known node, reversal, fast/slow pointers.',
          stageId: 'stage-3',
          tags: ['linked-list', 'pointers'],
          resources: [practice('VisuAlgo - linked list', 'https://visualgo.net/en/list')]
        },
        {
          id: 'stacks-queues',
          title: 'Stacks and queues',
          description: 'LIFO and FIFO, bracket matching, ring buffers, and the queues behind BFS.',
          stageId: 'stage-3',
          tags: ['stack', 'queue', 'brackets'],
          resources: [link('Stack (Wikipedia)', 'https://en.wikipedia.org/wiki/Stack_(abstract_data_type)'), link('Queue (Wikipedia)', 'https://en.wikipedia.org/wiki/Queue_(abstract_data_type)')]
        },
        {
          id: 'trees',
          title: 'Trees and binary search trees',
          description: 'Traversals, BST invariants, balance, and why sorted input degenerates a naive BST.',
          stageId: 'stage-3',
          tags: ['binary-tree', 'bst', 'traversal'],
          resources: [practice('VisuAlgo - BST', 'https://visualgo.net/en/bst')]
        },
        {
          id: 'heaps',
          title: 'Heaps and priority queues',
          description: 'Array-backed binary heaps, sift up/down, top-k and scheduling.',
          stageId: 'stage-3',
          tags: ['heap', 'priority-queue', 'sift-down'],
          resources: [practice('VisuAlgo - binary heap', 'https://visualgo.net/en/heap')]
        },
        {
          id: 'tries-graphs',
          title: 'Tries and graphs',
          description: 'Prefix trees for strings; adjacency lists and matrices for graphs.',
          stageId: 'stage-3',
          tags: ['trie', 'graph', 'adjacency-list'],
          resources: [link('Trie (Wikipedia)', 'https://en.wikipedia.org/wiki/Trie'), practice('VisuAlgo - graph structures', 'https://visualgo.net/en/graphds')]
        }
      ]
    },
    {
      id: 'algorithms',
      title: 'Algorithms',
      nodes: [
        {
          id: 'sorting',
          title: 'Sorting',
          description: 'Insertion, merge, quick, counting sort; stability; comparators.',
          stageId: 'stage-4',
          tags: ['sorting', 'quicksort', 'stability', 'comparators'],
          resources: [practice('VisuAlgo - sorting', 'https://visualgo.net/en/sorting'), link('Sorting algorithms (cp-algorithms)', 'https://cp-algorithms.com/')]
        },
        {
          id: 'searching',
          title: 'Binary search',
          description: 'Halving a monotonic range, invariants, lower/upper bound, binary search on the answer.',
          stageId: 'stage-4',
          tags: ['binary-search', 'invariants'],
          resources: [link('Binary search (cp-algorithms)', 'https://cp-algorithms.com/num_methods/binary_search.html')]
        },
        {
          id: 'two-pointers-window',
          title: 'Two pointers and sliding window',
          description: 'Linear-time patterns for sorted arrays and contiguous subarrays.',
          stageId: 'stage-4',
          tags: ['two-pointers', 'sliding-window'],
          resources: [practice('NeetCode roadmap', 'https://neetcode.io/roadmap'), practice('LeetCode Explore', 'https://leetcode.com/explore/')]
        },
        {
          id: 'graph-algorithms',
          title: 'Graph algorithms',
          description: 'BFS, DFS, topological sort, Dijkstra, union-find, minimum spanning trees.',
          stageId: 'stage-4',
          tags: ['bfs', 'dfs', 'graphs'],
          resources: [link('Graph algorithms (cp-algorithms)', 'https://cp-algorithms.com/#graphs'), practice('VisuAlgo - graph traversal', 'https://visualgo.net/en/dfsbfs')]
        },
        {
          id: 'dynamic-programming',
          title: 'Dynamic programming',
          description: 'Overlapping subproblems, memoisation vs tabulation, and the classic problems.',
          stageId: 'stage-4',
          tags: ['dynamic-programming', 'memoisation', 'bottom-up'],
          resources: [link('Dynamic programming (cp-algorithms)', 'https://cp-algorithms.com/#dynamic-programming'), course('MIT 6.006 - dynamic programming lectures', 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/')]
        },
        {
          id: 'greedy-backtracking',
          title: 'Greedy and backtracking',
          description: 'When a local choice is globally optimal, and exhaustive search with pruning when it is not.',
          stageId: 'stage-4',
          tags: ['greedy', 'backtracking'],
          resources: [link('Greedy algorithms (Wikipedia)', 'https://en.wikipedia.org/wiki/Greedy_algorithm'), link('Backtracking (Wikipedia)', 'https://en.wikipedia.org/wiki/Backtracking')]
        }
      ]
    },
    {
      id: 'systems',
      title: 'How computers work',
      nodes: [
        {
          id: 'architecture',
          title: 'Computer architecture',
          description: 'Binary, memory hierarchy, caches, CPUs and instruction execution.',
          optional: true,
          resources: [course('Nand2Tetris', 'https://www.nand2tetris.org/'), book('Computer Systems: A Programmer\'s Perspective (site)', 'https://csapp.cs.cmu.edu/')]
        },
        {
          id: 'operating-systems',
          title: 'Operating systems',
          description: 'Processes and threads, scheduling, virtual memory, filesystems, concurrency.',
          optional: true,
          resources: [book('Operating Systems: Three Easy Pieces (free)', 'https://pages.cs.wisc.edu/~remzi/OSTEP/')]
        },
        {
          id: 'networking',
          title: 'Networking',
          description: 'The layered model, TCP/IP, DNS, HTTP and TLS.',
          optional: true,
          resources: [book('Computer Networking: A Top-Down Approach (site)', 'https://gaia.cs.umass.edu/kurose_ross/index.php'), link('Cloudflare Learning Center', 'https://www.cloudflare.com/learning/')]
        },
        {
          id: 'databases-theory',
          title: 'Databases',
          description: 'Relational model, indexing structures, transactions and storage engines.',
          stageId: 'stage-7',
          tags: ['indexes', 'transactions'],
          resources: [course('CMU 15-445 Database Systems', 'https://15445.courses.cs.cmu.edu/')]
        },
        {
          id: 'cs-more',
          title: 'Keep going',
          description: 'Compilers, distributed systems, and a self-study curriculum for the rest.',
          resources: [roadmapSh('computer-science'), link('Teach Yourself Computer Science', 'https://teachyourselfcs.com/'), link('data-structures-and-algorithms roadmap on roadmap.sh', 'https://roadmap.sh/datastructures-and-algorithms', 'roadmap'), docs('Introduction to Algorithms (CLRS) at MIT Press', 'https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/')]
        }
      ]
    }
  ]
};
