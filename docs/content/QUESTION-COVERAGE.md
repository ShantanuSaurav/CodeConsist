# New-question coverage and answer audit

This is a maintainer review snapshot of the 500-question expansion. The TypeScript batches are the source of truth; this file does not feed the application. Each answer is the keyed correct choice. Execution evidence applies to output predictions; conceptual answers additionally require source and editorial review. Links are application-relative reading targets, not new routes.

## stage-1 — 50 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-1-c01 | A block keeps its own score | let | output_prediction / easy | 7 | /dashboard/learn/stage-1/read#variables-scope-and-hoisting |
| stage-1-c02 | A constant can hold a changing record | let | output_prediction / easy | 5 | /dashboard/learn/stage-1/read#variables-scope-and-hoisting |
| stage-1-c03 | An unset local | undefined | output_prediction / easy | undefined | /dashboard/learn/stage-1/read#variables-scope-and-hoisting |
| stage-1-c04 | Explicit number conversion | type-conversion | output_prediction / easy | 15 | /dashboard/learn/stage-1/read#types-typeof-and-coercion |
| stage-1-c05 | Concatenation proceeds left to right | coercion | output_prediction / medium | 54 | /dashboard/learn/stage-1/read#types-typeof-and-coercion |
| stage-1-c06 | Strictly different types | equality | output_prediction / easy | false | /dashboard/learn/stage-1/read#types-typeof-and-coercion |
| stage-1-c07 | An empty array is still an object | truthiness | output_prediction / medium | true | /dashboard/learn/stage-1/read#types-typeof-and-coercion |
| stage-1-c08 | Nullish fallback preserves zero | operators | output_prediction / medium | 0 | /dashboard/learn/stage-1/read#types-typeof-and-coercion |
| stage-1-c09 | Logical OR uses truthiness | truthiness | output_prediction / easy | guest | /dashboard/learn/stage-1/read#types-typeof-and-coercion |
| stage-1-c10 | Logical AND returns an operand | operators | output_prediction / medium | 6 | /dashboard/learn/stage-1/read#types-typeof-and-coercion |
| stage-1-c11 | Grouping arithmetic | precedence | output_prediction / easy | 18 | /dashboard/learn/stage-1/read#arithmetic-modulo-and-precedence |
| stage-1-c12 | Remainder after division | modulo | output_prediction / easy | 3 | /dashboard/learn/stage-1/read#arithmetic-modulo-and-precedence |
| stage-1-c13 | Exponent before subtraction | precedence | output_prediction / medium | 12 | /dashboard/learn/stage-1/read#arithmetic-modulo-and-precedence |
| stage-1-c14 | A post-increment snapshot | expressions | output_prediction / medium | 4:5 | /dashboard/learn/stage-1/read#arithmetic-modulo-and-precedence |
| stage-1-c15 | Choosing a boundary label | ternary | output_prediction / easy | adult | /dashboard/learn/stage-1/read#conditionals-switch-and-the-ternary |
| stage-1-c16 | Only the first matching branch runs | conditionals | output_prediction / easy | pass | /dashboard/learn/stage-1/read#conditionals-switch-and-the-ternary |
| stage-1-c17 | A deliberate switch fall-through | switch | output_prediction / medium | AB | /dashboard/learn/stage-1/read#conditionals-switch-and-the-ternary |
| stage-1-c18 | Stopping before a sentinel | loops | output_prediction / easy | 6 | /dashboard/learn/stage-1/read#loops-and-off-by-one-errors |
| stage-1-c19 | Skipping just one iteration | loops | output_prediction / medium | ac | /dashboard/learn/stage-1/read#loops-and-off-by-one-errors |
| stage-1-c20 | An exclusive loop limit | off-by-one | output_prediction / easy | 3 | /dashboard/learn/stage-1/read#loops-and-off-by-one-errors |
| stage-1-c21 | A do-while starts with its body | loops | output_prediction / medium | 1 | /dashboard/learn/stage-1/read#loops-and-off-by-one-errors |
| stage-1-c22 | A string slice excludes its end | strings | output_prediction / easy | lan | /dashboard/learn/stage-1/read#strings-and-template-literals |
| stage-1-c23 | Trimming does not collapse internal spaces | methods | output_prediction / easy | 4 | /dashboard/learn/stage-1/read#strings-and-template-literals |
| stage-1-c24 | A repeated string | strings | output_prediction / easy | hahaha | /dashboard/learn/stage-1/read#strings-and-template-literals |
| stage-1-c25 | Template expression evaluation | template-literals | output_prediction / easy | Items: 5 | /dashboard/learn/stage-1/read#strings-and-template-literals |
| stage-1-c26 | Default parameters and explicit null | parameters | output_prediction / medium | null | /dashboard/learn/stage-1/read#functions-parameters-and-return |
| stage-1-c27 | A default for an omitted argument | parameters | output_prediction / easy | 12 | /dashboard/learn/stage-1/read#functions-parameters-and-return |
| stage-1-c28 | A bare return | return | output_prediction / medium | undefined | /dashboard/learn/stage-1/read#functions-parameters-and-return |
| stage-1-c29 | Collecting extra arguments | parameters | output_prediction / medium | 3 | /dashboard/learn/stage-1/read#functions-parameters-and-return |
| stage-1-c30 | Returning an object from an arrow | functions | output_prediction / medium | true | /dashboard/learn/stage-1/read#functions-parameters-and-return |
| stage-1-c31 | Destructuring a default property | destructuring | output_prediction / medium | 10 | /dashboard/learn/stage-1/read#functions-parameters-and-return |
| stage-1-c32 | Skipping an array element in destructuring | destructuring | output_prediction / medium | 18 | /dashboard/learn/stage-1/read#functions-parameters-and-return |
| stage-1-c33 | Push returns the new length | arrays | output_prediction / easy | 3 | /dashboard/learn/stage-1/read#arrays-and-immutability |
| stage-1-c34 | Pop changes the source | arrays | output_prediction / easy | 11:2 | /dashboard/learn/stage-1/read#arrays-and-immutability |
| stage-1-c35 | A non-mutating array slice | immutability | output_prediction / medium | 1-2-3 | /dashboard/learn/stage-1/read#arrays-and-immutability |
| stage-1-c36 | Spread copies only the outer array | immutability | output_prediction / hard | 9 | /dashboard/learn/stage-1/read#arrays-and-immutability |
| stage-1-c37 | Mapping without mutation | arrays | output_prediction / easy | 4,6:2 | /dashboard/learn/stage-1/read#arrays-and-immutability |
| stage-1-c38 | Filtering at a strict threshold | arrays | output_prediction / medium | 2 | /dashboard/learn/stage-1/read#arrays-and-immutability |
| stage-1-c39 | Reducing with an initial value | arrays | output_prediction / medium | 15 | /dashboard/learn/stage-1/read#arrays-and-immutability |
| stage-1-c40 | Closures observe a later assignment | closures | output_prediction / hard | new | /dashboard/learn/stage-1/read#scope-and-closures |
| stage-1-c41 | Independent factory state | closures | output_prediction / hard | 2:1 | /dashboard/learn/stage-1/read#scope-and-closures |
| stage-1-c42 | A caught error has a message | try-catch | output_prediction / medium | missing | /dashboard/learn/stage-1/read#errors-and-try-catch |
| stage-1-c43 | Finally runs on a normal return | try-catch | output_prediction / hard | cleanup<br>done | /dashboard/learn/stage-1/read#errors-and-try-catch |
| stage-1-c44 | Recursive countdown with an explicit base | recursion | output_prediction / hard | 10 | /dashboard/learn/stage-1/read#recursion-and-the-base-case |
| stage-1-c45 | Reassigning a primitive parameter | parameters | output_prediction / medium | 5 | /dashboard/learn/stage-1/read#functions-parameters-and-return |
| stage-1-c46 | Object spread overwrite order | destructuring | output_prediction / hard | read:write | /dashboard/learn/stage-1/read#functions-parameters-and-return |
| stage-1-c47 | Missing optional property | operators | output_prediction / medium | unknown | /dashboard/learn/stage-1/read#types-typeof-and-coercion |
| stage-1-c48 | A finite-number check avoids coercion | type-conversion | output_prediction / hard | false | /dashboard/learn/stage-1/read#types-typeof-and-coercion |
| stage-1-c49 | Integer parsing stops at invalid text | type-conversion | output_prediction / medium | 42 | /dashboard/learn/stage-1/read#types-typeof-and-coercion |
| stage-1-c50 | String replacement leaves the source intact | strings | output_prediction / medium | blue-red:red-red | /dashboard/learn/stage-1/read#strings-and-template-literals |

## stage-2 — 50 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-2-c01 | Selecting the penultimate item | negative-index | output_prediction / easy | 30 | /dashboard/learn/stage-2/read#lists-indexing-and-slicing |
| stage-2-c02 | Taking alternating positions | slicing | output_prediction / easy | [0, 2, 4] | /dashboard/learn/stage-2/read#lists-indexing-and-slicing |
| stage-2-c03 | A reversed slice is independent | slicing | output_prediction / medium | [1, 2, 3] | /dashboard/learn/stage-2/read#lists-indexing-and-slicing |
| stage-2-c04 | A slice can extend past the end | slicing | output_prediction / easy | [5, 6] | /dashboard/learn/stage-2/read#lists-indexing-and-slicing |
| stage-2-c05 | Append returns no new list | lists | output_prediction / medium | True [1, 2] | /dashboard/learn/stage-2/read#lists-indexing-and-slicing |
| stage-2-c06 | Extend consumes individual elements | lists | output_prediction / easy | [1, 2, 3] | /dashboard/learn/stage-2/read#lists-indexing-and-slicing |
| stage-2-c07 | An indexed pop | lists | output_prediction / medium | 4 [2, 6] | /dashboard/learn/stage-2/read#lists-indexing-and-slicing |
| stage-2-c08 | Whitespace splitting | split | output_prediction / easy | ['a', 'b', 'c'] | /dashboard/learn/stage-2/read#strings-and-formatting |
| stage-2-c09 | Joining text with a separator | strings | output_prediction / easy | usr/local/bin | /dashboard/learn/stage-2/read#strings-and-formatting |
| stage-2-c10 | Case conversion makes a new string | methods | output_prediction / easy | HELLO Hello | /dashboard/learn/stage-2/read#strings-and-formatting |
| stage-2-c11 | Replacing all ordinary occurrences | strings | output_prediction / medium | bonono | /dashboard/learn/stage-2/read#strings-and-formatting |
| stage-2-c12 | An f-string precision | f-strings | output_prediction / medium | 12.50 | /dashboard/learn/stage-2/read#strings-and-formatting |
| stage-2-c13 | A one-item tuple needs a comma | tuples | output_prediction / easy | tuple | /dashboard/learn/stage-2/read#tuples-mutability-and-identity |
| stage-2-c14 | Tuple contents can reference a list | mutability | output_prediction / hard | [1, 3] | /dashboard/learn/stage-2/read#tuples-mutability-and-identity |
| stage-2-c15 | Two names share one list | identity | output_prediction / easy | [9, 2] | /dashboard/learn/stage-2/read#tuples-mutability-and-identity |
| stage-2-c16 | Equal contents need not mean identity | equality | output_prediction / medium | True False | /dashboard/learn/stage-2/read#tuples-mutability-and-identity |
| stage-2-c17 | A shallow list copy shares nested values | references | output_prediction / hard | [1, 3] | /dashboard/learn/stage-2/read#tuples-mutability-and-identity |
| stage-2-c18 | A missing dictionary lookup with a default | get | output_prediction / easy | 0 1 | /dashboard/learn/stage-2/read#dicts-sets-and-hashing |
| stage-2-c19 | Dictionary membership checks keys | dicts | output_prediction / easy | True False | /dashboard/learn/stage-2/read#dicts-sets-and-hashing |
| stage-2-c20 | Updating an existing dictionary key | dicts | output_prediction / easy | 2 8 | /dashboard/learn/stage-2/read#dicts-sets-and-hashing |
| stage-2-c21 | Set membership removes repeated values | sets | output_prediction / easy | 2 | /dashboard/learn/stage-2/read#dicts-sets-and-hashing |
| stage-2-c22 | Intersection displayed deterministically | sets | output_prediction / medium | [2, 3] | /dashboard/learn/stage-2/read#dicts-sets-and-hashing |
| stage-2-c23 | Difference is directional | sets | output_prediction / medium | [1, 3] | /dashboard/learn/stage-2/read#dicts-sets-and-hashing |
| stage-2-c24 | An empty container is falsy | truthiness | output_prediction / easy | False True | /dashboard/learn/stage-2/read#truthiness-conditionals-and-operators |
| stage-2-c25 | Floor division with a negative dividend | floor-division | output_prediction / medium | -3 | /dashboard/learn/stage-2/read#truthiness-conditionals-and-operators |
| stage-2-c26 | Remainder paired with floor division | modulo | output_prediction / medium | 2 | /dashboard/learn/stage-2/read#truthiness-conditionals-and-operators |
| stage-2-c27 | A comparison chain | operators | output_prediction / medium | True | /dashboard/learn/stage-2/read#truthiness-conditionals-and-operators |
| stage-2-c28 | OR preserves an operand | truthiness | output_prediction / medium | [5] | /dashboard/learn/stage-2/read#truthiness-conditionals-and-operators |
| stage-2-c29 | Range skips by a step | iterables | output_prediction / easy | [2, 5, 8] | /dashboard/learn/stage-2/read#loops-enumerate-zip-and-unpacking |
| stage-2-c30 | Enumerating from one | enumerate | output_prediction / easy | [(1, 'a'), (2, 'b')] | /dashboard/learn/stage-2/read#loops-enumerate-zip-and-unpacking |
| stage-2-c31 | Zip stops at the shorter iterable | zip | output_prediction / medium | [(1, 'a'), (2, 'b')] | /dashboard/learn/stage-2/read#loops-enumerate-zip-and-unpacking |
| stage-2-c32 | Starred unpacking collects the middle | unpacking | output_prediction / medium | [2, 3, 4] | /dashboard/learn/stage-2/read#loops-enumerate-zip-and-unpacking |
| stage-2-c33 | A filtered square comprehension | comprehensions | output_prediction / easy | [1, 9] | /dashboard/learn/stage-2/read#comprehensions-and-filtering |
| stage-2-c34 | A dictionary comprehension | comprehensions | output_prediction / medium | 3 | /dashboard/learn/stage-2/read#comprehensions-and-filtering |
| stage-2-c35 | Nested comprehension order | comprehensions | output_prediction / hard | [11, 21, 12, 22] | /dashboard/learn/stage-2/read#comprehensions-and-filtering |
| stage-2-c36 | Sorting without modifying the original | sorting | output_prediction / easy | [1, 2, 3] [3, 1, 2] | /dashboard/learn/stage-2/read#sorting-and-key-functions |
| stage-2-c37 | Sorting by string length | key-function | output_prediction / medium | ['fig', 'pear', 'banana'] | /dashboard/learn/stage-2/read#sorting-and-key-functions |
| stage-2-c38 | Stable equal sorting keys | sorting | output_prediction / hard | ['c', 'bb', 'aa'] | /dashboard/learn/stage-2/read#sorting-and-key-functions |
| stage-2-c39 | Summing with a starting value | built-ins | output_prediction / easy | 16 | /dashboard/learn/stage-2/read#sorting-and-key-functions |
| stage-2-c40 | All over an empty iterable | built-ins | output_prediction / hard | True False | /dashboard/learn/stage-2/read#sorting-and-key-functions |
| stage-2-c41 | Handling numeric conversion failure | exceptions | output_prediction / medium | invalid | /dashboard/learn/stage-2/read#exceptions |
| stage-2-c42 | An else after a successful try | try-except | output_prediction / medium | 9 | /dashboard/learn/stage-2/read#exceptions |
| stage-2-c43 | A finally after an exception handler | exceptions | output_prediction / medium | caught<br>closed | /dashboard/learn/stage-2/read#exceptions |
| stage-2-c44 | A generator resumes where it stopped | generators | output_prediction / medium | 2 5 | /dashboard/learn/stage-2/read#generators-and-lazy-evaluation |
| stage-2-c45 | A consumed generator has no remaining items | lazy-evaluation | output_prediction / hard | [2, 4] [] | /dashboard/learn/stage-2/read#generators-and-lazy-evaluation |
| stage-2-c46 | A default object survives calls | mutability | output_prediction / hard | 1 2 | /dashboard/learn/stage-2/read#tuples-mutability-and-identity |
| stage-2-c47 | A dictionary pop with a fallback | dicts | output_prediction / medium | 7 1 | /dashboard/learn/stage-2/read#dicts-sets-and-hashing |
| stage-2-c48 | Repetition can share nested lists | references | output_prediction / hard | [[8], [8], [8]] | /dashboard/learn/stage-2/read#tuples-mutability-and-identity |
| stage-2-c49 | Counting a substring | strings | output_prediction / easy | 2 | /dashboard/learn/stage-2/read#strings-and-formatting |
| stage-2-c50 | A generator expression can filter lazily | generators | output_prediction / medium | 4 5 | /dashboard/learn/stage-2/read#generators-and-lazy-evaluation |

## stage-3 — 40 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-3-c01 | Addressing an array slot | arrays | quiz / easy | The address is computed from the base and index | /dashboard/learn/stage-3/read#dynamic-arrays |
| stage-3-c02 | Opening space at the front | dynamic-array | quiz / easy | Shifting the existing elements right | /dashboard/learn/stage-3/read#dynamic-arrays |
| stage-3-c03 | Capacity is not length | dynamic-array | quiz / easy | The allocated room before another growth is needed | /dashboard/learn/stage-3/read#dynamic-arrays |
| stage-3-c04 | Why geometric growth helps | amortised | quiz / medium | Total copying over many appends grows linearly | /dashboard/learn/stage-3/read#dynamic-arrays |
| stage-3-c05 | Worst append versus average sequence | amortised | quiz / medium | O(n) for copying existing elements | /dashboard/learn/stage-3/read#dynamic-arrays |
| stage-3-c06 | A hash collision does not imply equality | collisions | quiz / easy | Resolve the collision while checking key equality | /dashboard/learn/stage-3/read#hash-maps-and-sets |
| stage-3-c07 | Separate chaining storage | chaining | quiz / medium | Into a collection associated with that bucket | /dashboard/learn/stage-3/read#hash-maps-and-sets |
| stage-3-c08 | Load factor | hash-map | quiz / medium | n / b | /dashboard/learn/stage-3/read#hash-maps-and-sets |
| stage-3-c09 | Hash-table worst case | hash-map | quiz / hard | O(n) | /dashboard/learn/stage-3/read#hash-maps-and-sets |
| stage-3-c10 | Set versus multiset needs | set | quiz / easy | Remembering how often each word appears | /dashboard/learn/stage-3/read#hash-maps-and-sets |
| stage-3-c11 | Undo history ordering | stack | quiz / easy | A stack | /dashboard/learn/stage-3/read#stacks-and-queues |
| stage-3-c12 | Serving arrivals in order | fifo | quiz / easy | A FIFO queue | /dashboard/learn/stage-3/read#stacks-and-queues |
| stage-3-c13 | Both ends of a deque | queue | quiz / medium | Insertion and removal at either end | /dashboard/learn/stage-3/read#stacks-and-queues |
| stage-3-c14 | Peek does not consume | stack | quiz / easy | Read the top item without removing it | /dashboard/learn/stage-3/read#stacks-and-queues |
| stage-3-c15 | Closing delimiters | brackets | quiz / medium | The most recently opened bracket must close first | /dashboard/learn/stage-3/read#stacks-and-queues |
| stage-3-c16 | Circular-buffer wraparound | queue | quiz / medium | 0 | /dashboard/learn/stage-3/read#stacks-and-queues |
| stage-3-c17 | Linked-list random access | linked-list | quiz / easy | Links must be followed one node at a time | /dashboard/learn/stage-3/read#linked-lists-and-pointers |
| stage-3-c18 | Insert after a known node | pointers | quiz / medium | Reconnect the new node and the known successor | /dashboard/learn/stage-3/read#linked-lists-and-pointers |
| stage-3-c19 | Why a previous pointer helps | linked-list | quiz / medium | Finding the predecessor directly | /dashboard/learn/stage-3/read#linked-lists-and-pointers |
| stage-3-c20 | A tail pointer for append | linked-list | quiz / medium | A pointer to the tail | /dashboard/learn/stage-3/read#linked-lists-and-pointers |
| stage-3-c21 | Binary tree is not necessarily a search tree | binary-tree | quiz / easy | Each node has at most two children | /dashboard/learn/stage-3/read#trees-and-binary-search-trees |
| stage-3-c22 | In-order traversal of a search tree | bst | quiz / medium | Left subtree, node, right subtree | /dashboard/learn/stage-3/read#trees-and-binary-search-trees |
| stage-3-c23 | A degenerate search tree | bst | quiz / hard | A chain with height proportional to the key count | /dashboard/learn/stage-3/read#trees-and-binary-search-trees |
| stage-3-c24 | Tree leaf definition | binary-tree | quiz / easy | A node with no children | /dashboard/learn/stage-3/read#trees-and-binary-search-trees |
| stage-3-c25 | Heap root guarantee | heap | quiz / easy | A minimum key in the heap | /dashboard/learn/stage-3/read#heaps-and-priority-queues |
| stage-3-c26 | Heap siblings need not be sorted | heap | quiz / medium | Each parent is no greater than its children | /dashboard/learn/stage-3/read#heaps-and-priority-queues |
| stage-3-c27 | Restoring order after root removal | sift-down | quiz / medium | Swap downward with the smaller child when needed | /dashboard/learn/stage-3/read#heaps-and-priority-queues |
| stage-3-c28 | Priority queue versus arrival order | priority-queue | quiz / easy | A min-priority queue keyed by deadline | /dashboard/learn/stage-3/read#heaps-and-priority-queues |
| stage-3-c29 | Trie edge meanings | trie | quiz / easy | A prefix of one or more stored words | /dashboard/learn/stage-3/read#tries |
| stage-3-c30 | Prefix is not necessarily a complete word | prefix | quiz / medium | The path can exist without cat being a stored word | /dashboard/learn/stage-3/read#tries |
| stage-3-c31 | Sparse graph storage | adjacency-list | quiz / medium | O(V + E) | /dashboard/learn/stage-3/read#graphs-representation-and-traversal |
| stage-3-c32 | A matrix edge lookup | adjacency-matrix | quiz / medium | Testing one possible edge by direct cell lookup | /dashboard/learn/stage-3/read#graphs-representation-and-traversal |
| stage-3-c33 | Directed edge orientation | graph | quiz / easy | B is reachable from A using that edge | /dashboard/learn/stage-3/read#graphs-representation-and-traversal |
| stage-3-c34 | BFS frontier structure | bfs | quiz / medium | A FIFO queue | /dashboard/learn/stage-3/read#graphs-representation-and-traversal |
| stage-3-c35 | Avoid revisiting graph cycles | graph | quiz / medium | A set of already visited vertices | /dashboard/learn/stage-3/read#graphs-representation-and-traversal |
| stage-3-c36 | LRU needs order and lookup | lru | quiz / hard | A hash map and a doubly linked list | /dashboard/learn/stage-3/read#putting-it-together-an-lru-cache |
| stage-3-c37 | Reading an LRU entry affects eviction | lru | quiz / medium | It becomes the most recently used entry | /dashboard/learn/stage-3/read#putting-it-together-an-lru-cache |
| stage-3-c38 | Object keys by identity in Map | reference-identity | quiz / medium | No, the new object has different identity | /dashboard/learn/stage-3/read#hash-maps-and-sets |
| stage-3-c39 | Reassigning a Map entry | map | quiz / easy | Leaves the size unchanged | /dashboard/learn/stage-3/read#hash-maps-and-sets |
| stage-3-c40 | Choose by access pattern | trade-offs | quiz / hard | A min-heap with logarithmic insertion and removal | /dashboard/learn/stage-3/read#complexity-and-trade-offs |

## stage-4 — 40 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-4-c01 | Two consecutive linear passes | big-o | quiz / easy | O(n) | /dashboard/learn/stage-4/read#big-o-and-counting-loops |
| stage-4-c02 | A triangular nested loop | nested-loops | quiz / medium | O(n squared) | /dashboard/learn/stage-4/read#big-o-and-counting-loops |
| stage-4-c03 | Repeatedly halving a range | complexity | quiz / easy | O(log n) | /dashboard/learn/stage-4/read#big-o-and-counting-loops |
| stage-4-c04 | Independent input sizes | complexity | quiz / medium | O(n * m) | /dashboard/learn/stage-4/read#big-o-and-counting-loops |
| stage-4-c05 | Counting output has a lower bound | big-o | quiz / hard | Omega(n) time | /dashboard/learn/stage-4/read#big-o-and-counting-loops |
| stage-4-c06 | Pair sums in a sorted array | two-pointers | quiz / medium | Advance the left pointer | /dashboard/learn/stage-4/read#two-pointers |
| stage-4-c07 | Discarding a pair-search boundary | sorted-array | quiz / hard | Any other remaining partner with that endpoint is at least as large | /dashboard/learn/stage-4/read#two-pointers |
| stage-4-c08 | Palindrome pointer stopping | two-pointers | quiz / easy | When the pointers meet or cross | /dashboard/learn/stage-4/read#two-pointers |
| stage-4-c09 | Partition is not sorting | partitioning | quiz / medium | Values are separated to appropriate sides of the pivot | /dashboard/learn/stage-4/read#two-pointers |
| stage-4-c10 | Fixed-size window update | sliding-window | quiz / easy | Subtract the leaving item and add the entering item | /dashboard/learn/stage-4/read#sliding-window |
| stage-4-c11 | Counting fixed-width windows | subarrays | quiz / easy | 6 | /dashboard/learn/stage-4/read#sliding-window |
| stage-4-c12 | Negative numbers break a monotone window rule | sliding-window | quiz / hard | Removing the left item can increase the sum | /dashboard/learn/stage-4/read#sliding-window |
| stage-4-c13 | Prefix sums use an empty prefix | prefix-sums | quiz / easy | 0 | /dashboard/learn/stage-4/read#prefix-sums |
| stage-4-c14 | Inclusive range sum | range-query | quiz / medium | prefix[right + 1] - prefix[left] | /dashboard/learn/stage-4/read#prefix-sums |
| stage-4-c15 | Static preprocessing trade-off | prefix-sums | quiz / medium | O(n) preprocessing and O(1) per range query | /dashboard/learn/stage-4/read#prefix-sums |
| stage-4-c16 | Binary search prerequisite | binary-search | quiz / easy | The array is ordered according to the comparison | /dashboard/learn/stage-4/read#binary-search-and-invariants |
| stage-4-c17 | A lower-bound result | binary-search | quiz / medium | 1 | /dashboard/learn/stage-4/read#binary-search-and-invariants |
| stage-4-c18 | No qualifying lower bound | binary-search | quiz / medium | 3, the array length | /dashboard/learn/stage-4/read#binary-search-and-invariants |
| stage-4-c19 | A shrinking search invariant | invariants | quiz / hard | To guarantee progress toward termination | /dashboard/learn/stage-4/read#binary-search-and-invariants |
| stage-4-c20 | Stable sorting preserves ties | stability | quiz / easy | Their original relative order is preserved | /dashboard/learn/stage-4/read#sorting-algorithms-stability-comparators |
| stage-4-c21 | Merge two sorted sequences | merge | quiz / medium | O(n + m) | /dashboard/learn/stage-4/read#sorting-algorithms-stability-comparators |
| stage-4-c22 | Merge-sort recurrence | divide-and-conquer | quiz / hard | O(n log n) | /dashboard/learn/stage-4/read#sorting-algorithms-stability-comparators |
| stage-4-c23 | Quicksort worst-case splits | quicksort | quiz / hard | O(n squared) | /dashboard/learn/stage-4/read#sorting-algorithms-stability-comparators |
| stage-4-c24 | Comparator equality | comparators | quiz / easy | The two values compare equal for this ordering | /dashboard/learn/stage-4/read#sorting-algorithms-stability-comparators |
| stage-4-c25 | A recursive measure | base-case | quiz / medium | A measure that moves toward the base case each call | /dashboard/learn/stage-4/read#recursion-and-backtracking |
| stage-4-c26 | Recursion uses auxiliary storage | recursion | quiz / medium | O(n) | /dashboard/learn/stage-4/read#recursion-and-backtracking |
| stage-4-c27 | Undoing a backtracking choice | backtracking | quiz / medium | Remove that choice before exploring a sibling branch | /dashboard/learn/stage-4/read#recursion-and-backtracking |
| stage-4-c28 | Pruning requires a valid reason | backtracking | quiz / hard | When the partial state cannot extend to any valid solution | /dashboard/learn/stage-4/read#recursion-and-backtracking |
| stage-4-c29 | Memoization keys must describe state | memoisation | quiz / hard | The pair of state variables together | /dashboard/learn/stage-4/read#dynamic-programming |
| stage-4-c30 | Overlapping subproblems | dynamic-programming | quiz / easy | Recomputing an already known state result | /dashboard/learn/stage-4/read#dynamic-programming |
| stage-4-c31 | Bottom-up dependency order | bottom-up | quiz / medium | After the states its recurrence depends on | /dashboard/learn/stage-4/read#dynamic-programming |
| stage-4-c32 | A greedy coin counterexample | coin-change | quiz / hard | 6 | /dashboard/learn/stage-4/read#dynamic-programming |
| stage-4-c33 | Greedy needs justification | greedy | quiz / medium | A local choice can block a better later combination | /dashboard/learn/stage-4/read#greedy-algorithms |
| stage-4-c34 | Interval scheduling objective | optimality | quiz / hard | Repeatedly choose the compatible interval ending earliest | /dashboard/learn/stage-4/read#greedy-algorithms |
| stage-4-c35 | Shortest unweighted paths | bfs | quiz / medium | It explores vertices in nondecreasing distance layers | /dashboard/learn/stage-4/read#graph-search-bfs-and-dfs |
| stage-4-c36 | DFS is not shortest-path search | dfs | quiz / medium | That it has the fewest edges | /dashboard/learn/stage-4/read#graph-search-bfs-and-dfs |
| stage-4-c37 | Mark before enqueuing | bfs | quiz / hard | To avoid scheduling the same vertex from multiple parents | /dashboard/learn/stage-4/read#graph-search-bfs-and-dfs |
| stage-4-c38 | Topological ordering requirement | graphs | quiz / medium | Directed acyclic graphs | /dashboard/learn/stage-4/read#graph-search-bfs-and-dfs |
| stage-4-c39 | Test a minimal boundary case | debugging | quiz / easy | An empty array with an explicit expected result | /dashboard/learn/stage-4/read#solving-a-new-problem |
| stage-4-c40 | State an invariant precisely | invariants | quiz / hard | Before index k, total equals the sum of indices below k | /dashboard/learn/stage-4/read#binary-search-and-invariants |

## stage-5 — 40 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-5-c01 | A missing DOM match | querying | quiz / easy | null | /dashboard/learn/stage-5/read#the-dom-querying-and-mutating |
| stage-5-c02 | A selector snapshot | dom | quiz / medium | Its membership stays unchanged | /dashboard/learn/stage-5/read#the-dom-querying-and-mutating |
| stage-5-c03 | Moving an existing node | appendchild | quiz / medium | The node moves from its old parent to the new parent | /dashboard/learn/stage-5/read#the-dom-querying-and-mutating |
| stage-5-c04 | Plain text insertion | mutation | quiz / easy | textContent | /dashboard/learn/stage-5/read#the-dom-querying-and-mutating |
| stage-5-c05 | Removing a class safely | dom | quiz / easy | element.classList.remove("active") | /dashboard/learn/stage-5/read#the-dom-querying-and-mutating |
| stage-5-c06 | Event target versus listener element | events | quiz / medium | The panel where the listener is running | /dashboard/learn/stage-5/read#events-bubbling-delegation-closest |
| stage-5-c07 | Delegating dynamically added items | delegation | quiz / medium | Bubbled item events can be handled by the existing container listener | /dashboard/learn/stage-5/read#events-bubbling-delegation-closest |
| stage-5-c08 | Cancel navigation, not propagation | events | quiz / easy | event.preventDefault() | /dashboard/learn/stage-5/read#events-bubbling-delegation-closest |
| stage-5-c09 | Stopping bubbling | stoppropagation | quiz / medium | Further propagation to other nodes along the event path | /dashboard/learn/stage-5/read#events-bubbling-delegation-closest |
| stage-5-c10 | Finding an ancestor control | closest | quiz / medium | The element itself before its ancestors | /dashboard/learn/stage-5/read#events-bubbling-delegation-closest |
| stage-5-c11 | Promise callbacks after the stack | microtasks | quiz / medium | After the current synchronous stack completes | /dashboard/learn/stage-5/read#the-event-loop-microtasks-and-timers |
| stage-5-c12 | Zero-delay timer is not immediate | settimeout | quiz / easy | It is scheduled rather than run inline | /dashboard/learn/stage-5/read#the-event-loop-microtasks-and-timers |
| stage-5-c13 | A long synchronous loop | event-loop | quiz / medium | It occupies the main thread needed for other work | /dashboard/learn/stage-5/read#the-event-loop-microtasks-and-timers |
| stage-5-c14 | Async function return type | async-await | quiz / easy | A Promise that fulfills with 7 | /dashboard/learn/stage-5/read#promises-and-async-await |
| stage-5-c15 | Handling a rejected await | async-await | quiz / medium | Put await inside a matching try/catch | /dashboard/learn/stage-5/read#promises-and-async-await |
| stage-5-c16 | Promise.all result order | promises | quiz / medium | By their positions in the input iterable | /dashboard/learn/stage-5/read#promises-and-async-await |
| stage-5-c17 | Inspect every settlement | allsettled | quiz / medium | Promise.allSettled | /dashboard/learn/stage-5/read#promises-and-async-await |
| stage-5-c18 | HTTP error is not necessarily a fetch rejection | fetch | quiz / medium | response.ok or response.status | /dashboard/learn/stage-5/read#fetch-http-and-cors |
| stage-5-c19 | Parsing the response body | fetch | quiz / easy | A Promise for the parsed JSON body | /dashboard/learn/stage-5/read#fetch-http-and-cors |
| stage-5-c20 | Canceling a pending fetch | fetch | quiz / medium | An AbortController signal supplied to fetch | /dashboard/learn/stage-5/read#fetch-http-and-cors |
| stage-5-c21 | CORS is not authentication | cors | quiz / hard | Whether browser scripts may access cross-origin responses | /dashboard/learn/stage-5/read#fetch-http-and-cors |
| stage-5-c22 | Query parameter encoding | query-string | quiz / easy | URLSearchParams | /dashboard/learn/stage-5/read#fetch-http-and-cors |
| stage-5-c23 | Border-box width accounting | box-sizing | quiz / medium | The content, padding and border | /dashboard/learn/stage-5/read#css-cascade-specificity-box-model |
| stage-5-c24 | A rem reference | rem | quiz / easy | The root element font size | /dashboard/learn/stage-5/read#css-cascade-specificity-box-model |
| stage-5-c25 | Specificity within equal cascade conditions | specificity | quiz / medium | #profile | /dashboard/learn/stage-5/read#css-cascade-specificity-box-model |
| stage-5-c26 | Later source order as a tie-break | cascade | quiz / medium | The declaration later in source order | /dashboard/learn/stage-5/read#css-cascade-specificity-box-model |
| stage-5-c27 | Main-axis alignment | flexbox | quiz / easy | Distribution along the main axis | /dashboard/learn/stage-5/read#layout-flexbox-grid-positioning-and-stacking |
| stage-5-c28 | A two-dimensional layout tool | grid | quiz / easy | CSS Grid | /dashboard/learn/stage-5/read#layout-flexbox-grid-positioning-and-stacking |
| stage-5-c29 | Sticky needs a threshold | positioning | quiz / medium | top | /dashboard/learn/stage-5/read#layout-flexbox-grid-positioning-and-stacking |
| stage-5-c30 | Z-index is scoped | stacking-context | quiz / hard | Its whole parent context is stacked below the other context | /dashboard/learn/stage-5/read#layout-flexbox-grid-positioning-and-stacking |
| stage-5-c31 | Storage values are strings | storage | quiz / easy | A string | /dashboard/learn/stage-5/read#storage |
| stage-5-c32 | A missing storage key | storage | quiz / easy | null | /dashboard/learn/stage-5/read#storage |
| stage-5-c33 | Session storage scope | sessionStorage | quiz / medium | The top-level browsing context such as a tab | /dashboard/learn/stage-5/read#storage |
| stage-5-c34 | A real action control | semantic-html | quiz / easy | A button element | /dashboard/learn/stage-5/read#accessibility-and-semantic-html |
| stage-5-c35 | Label a form field | accessibility | quiz / easy | Use a label with for="email" | /dashboard/learn/stage-5/read#accessibility-and-semantic-html |
| stage-5-c36 | Decorative image alternative | accessibility | quiz / medium | An empty alt attribute | /dashboard/learn/stage-5/read#accessibility-and-semantic-html |
| stage-5-c37 | ARIA does not implement interaction | aria | quiz / medium | Appropriate focus and keyboard activation behavior | /dashboard/learn/stage-5/read#accessibility-and-semantic-html |
| stage-5-c38 | Focus must remain visible | accessibility | quiz / easy | Replace the default outline with another clear focus indicator | /dashboard/learn/stage-5/read#accessibility-and-semantic-html |
| stage-5-c39 | Untrusted HTML needs more than a blacklist | xss | quiz / hard | Use a maintained HTML sanitizer with a restrictive policy | /dashboard/learn/stage-5/read#security-basics-xss |
| stage-5-c40 | A browser breakpoint | debugging | quiz / easy | Pause execution to inspect state at that point | /dashboard/learn/stage-5/read#debugging-in-the-browser |

## stage-6 — 40 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-6-c01 | Path versus query parameter | parameters | quiz / easy | The path segment 42 | /dashboard/learn/stage-6/read#urls-routing-and-parameters |
| stage-6-c02 | Resource collection filtering | query-params | quiz / easy | /books?author=Ada | /dashboard/learn/stage-6/read#urls-routing-and-parameters |
| stage-6-c03 | URL fragments remain client-side | url | quiz / medium | The fragment setup | /dashboard/learn/stage-6/read#urls-routing-and-parameters |
| stage-6-c04 | Method semantics before naming | rest | quiz / medium | GET is defined as a safe retrieval method | /dashboard/learn/stage-6/read#urls-routing-and-parameters |
| stage-6-c05 | Idempotency is about intended effect | idempotency | quiz / medium | The intended server effect of one request versus repeats | /dashboard/learn/stage-6/read#http-methods-safety-and-idempotency |
| stage-6-c06 | PUT as replacement semantics | put | quiz / medium | Create or replace that resource state with the supplied representation | /dashboard/learn/stage-6/read#http-methods-safety-and-idempotency |
| stage-6-c07 | POST is not inherently retry-safe | post | quiz / medium | The first request may have succeeded before its response was lost | /dashboard/learn/stage-6/read#http-methods-safety-and-idempotency |
| stage-6-c08 | HEAD response body | http-methods | quiz / easy | It does not include the response content body | /dashboard/learn/stage-6/read#http-methods-safety-and-idempotency |
| stage-6-c09 | Created resource location | status-codes | quiz / easy | 201 Created with Location | /dashboard/learn/stage-6/read#status-codes |
| stage-6-c10 | Successful response without content | status-codes | quiz / easy | 204 No Content | /dashboard/learn/stage-6/read#status-codes |
| stage-6-c11 | Missing authentication challenge | status-codes | quiz / medium | 401 Unauthorized | /dashboard/learn/stage-6/read#status-codes |
| stage-6-c12 | Authenticated but forbidden | status-codes | quiz / easy | 403 Forbidden | /dashboard/learn/stage-6/read#status-codes |
| stage-6-c13 | Too many requests | status-codes | quiz / easy | 429 Too Many Requests | /dashboard/learn/stage-6/read#status-codes |
| stage-6-c14 | Accepted is not completed | status-codes | quiz / medium | That the task has already completed successfully | /dashboard/learn/stage-6/read#status-codes |
| stage-6-c15 | Request type versus desired response type | content-negotiation | quiz / medium | Accept | /dashboard/learn/stage-6/read#headers-content-negotiation-and-caching |
| stage-6-c16 | Describe a JSON request body | headers | quiz / easy | application/json | /dashboard/learn/stage-6/read#headers-content-negotiation-and-caching |
| stage-6-c17 | Conditional retrieval validator | etag | quiz / medium | If-None-Match | /dashboard/learn/stage-6/read#headers-content-negotiation-and-caching |
| stage-6-c18 | No-store versus revalidate | cache-control | quiz / hard | no-store | /dashboard/learn/stage-6/read#headers-content-negotiation-and-caching |
| stage-6-c19 | Private cache audience | caching | quiz / medium | Storage of the response by shared caches | /dashboard/learn/stage-6/read#headers-content-negotiation-and-caching |
| stage-6-c20 | Parse before using parsed input | middleware | quiz / easy | Before that handler reads the parsed body | /dashboard/learn/stage-6/read#middleware-and-request-pipelines |
| stage-6-c21 | One response per request | ordering | quiz / medium | Later code may try to send a second response | /dashboard/learn/stage-6/read#middleware-and-request-pipelines |
| stage-6-c22 | Preflight purpose | preflight | quiz / medium | To check whether the requested method and headers are permitted | /dashboard/learn/stage-6/read#middleware-and-request-pipelines |
| stage-6-c23 | Client validation is not a server boundary | input-validation | quiz / easy | Clients can bypass or alter the UI checks | /dashboard/learn/stage-6/read#input-validation-and-parsing |
| stage-6-c24 | Validate a complete integer field | parsing | quiz / medium | It accepts an initial integer prefix before invalid trailing text | /dashboard/learn/stage-6/read#input-validation-and-parsing |
| stage-6-c25 | Unexpected writable fields | mass-assignment | quiz / medium | Allowlist the specific editable fields | /dashboard/learn/stage-6/read#common-vulnerabilities-owasp |
| stage-6-c26 | Object-level authorization | idor | quiz / medium | That this user is authorized to access that invoice | /dashboard/learn/stage-6/read#common-vulnerabilities-owasp |
| stage-6-c27 | Parameterized values | sql-injection | quiz / medium | As a bound parameter rather than concatenated SQL text | /dashboard/learn/stage-6/read#common-vulnerabilities-owasp |
| stage-6-c28 | Password storage is not encryption storage | password-hashing | quiz / medium | A dedicated salted, costed password-hashing function | /dashboard/learn/stage-6/read#authentication-sessions-jwts-password-hashing |
| stage-6-c29 | Purpose of a password salt | salt | quiz / medium | To prevent identical passwords from sharing reusable hash work | /dashboard/learn/stage-6/read#authentication-sessions-jwts-password-hashing |
| stage-6-c30 | JWT payload visibility | jwt | quiz / medium | Anyone holding it can decode the payload | /dashboard/learn/stage-6/read#authentication-sessions-jwts-password-hashing |
| stage-6-c31 | Validate more than JWT syntax | jwt | quiz / hard | Signature, allowed algorithm, expiry and expected audience/issuer | /dashboard/learn/stage-6/read#authentication-sessions-jwts-password-hashing |
| stage-6-c32 | HttpOnly session cookie | sessions | quiz / medium | Access to the cookie through document.cookie | /dashboard/learn/stage-6/read#authentication-sessions-jwts-password-hashing |
| stage-6-c33 | Logout server-side session | sessions | quiz / medium | A copied session credential should stop authorizing requests | /dashboard/learn/stage-6/read#authentication-sessions-jwts-password-hashing |
| stage-6-c34 | Limit a sensitive endpoint | rate-limiting | quiz / medium | To constrain automated guessing and resource abuse | /dashboard/learn/stage-6/read#rate-limiting |
| stage-6-c35 | Token bucket burst allowance | token-bucket | quiz / hard | 10 | /dashboard/learn/stage-6/read#rate-limiting |
| stage-6-c36 | Do not expose internals in API errors | error-handling | quiz / easy | A safe error message and a correlation identifier | /dashboard/learn/stage-6/read#pagination-and-errors |
| stage-6-c37 | Offset pagination can shift | pagination | quiz / hard | Positions change between requests | /dashboard/learn/stage-6/read#pagination-and-errors |
| stage-6-c38 | Deterministic pagination ordering | pagination | quiz / medium | Use a unique tie-breaker such as id with created_at | /dashboard/learn/stage-6/read#pagination-and-errors |
| stage-6-c39 | Content length is not a trust signal | defensive-coding | quiz / medium | Enforce actual parser/server body-size limits | /dashboard/learn/stage-6/read#input-validation-and-parsing |
| stage-6-c40 | Do not trust client-supplied ownership | authentication | quiz / hard | From the verified session or authentication context | /dashboard/learn/stage-6/read#authentication-sessions-jwts-password-hashing |

## stage-7 — 40 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-7-c01 | Filtering individual rows | where | quiz / easy | WHERE | /dashboard/learn/stage-7/read#select-where-order-by-and-evaluation-order |
| stage-7-c02 | Ordering is an explicit request | order-by | quiz / easy | No particular order is guaranteed | /dashboard/learn/stage-7/read#select-where-order-by-and-evaluation-order |
| stage-7-c03 | Two sort keys | sorting | quiz / easy | Higher scores first, then lower ids among tied scores | /dashboard/learn/stage-7/read#select-where-order-by-and-evaluation-order |
| stage-7-c04 | Distinct projection combinations | distinct | quiz / medium | Duplicate pairs of projected city and country values | /dashboard/learn/stage-7/read#select-where-order-by-and-evaluation-order |
| stage-7-c05 | An inclusive range predicate | where | quiz / easy | Includes both 10 and 20 | /dashboard/learn/stage-7/read#select-where-order-by-and-evaluation-order |
| stage-7-c06 | SQL equality with NULL | null | quiz / medium | UNKNOWN | /dashboard/learn/stage-7/read#null-and-three-valued-logic |
| stage-7-c07 | Testing missing values | not-null | quiz / easy | email IS NULL | /dashboard/learn/stage-7/read#null-and-three-valued-logic |
| stage-7-c08 | WHERE and unknown predicates | three-valued-logic | quiz / medium | Only TRUE | /dashboard/learn/stage-7/read#null-and-three-valued-logic |
| stage-7-c09 | Fallback for missing values | null | quiz / easy | 7 | /dashboard/learn/stage-7/read#null-and-three-valued-logic |
| stage-7-c10 | NOT IN with a missing value | three-valued-logic | quiz / hard | UNKNOWN | /dashboard/learn/stage-7/read#null-and-three-valued-logic |
| stage-7-c11 | Inner join requirements | inner-join | quiz / easy | Pairs satisfying the join condition | /dashboard/learn/stage-7/read#joins |
| stage-7-c12 | Left join unmatched fields | left-join | quiz / easy | As NULL values | /dashboard/learn/stage-7/read#joins |
| stage-7-c13 | Join multiplicity | cardinality | quiz / medium | 3 | /dashboard/learn/stage-7/read#joins |
| stage-7-c14 | Two many-side joins can multiply | fan-out | quiz / hard | 6 | /dashboard/learn/stage-7/read#joins |
| stage-7-c15 | An outer join filtered afterward | left-join | quiz / hard | The null-extended status comparison is not TRUE | /dashboard/learn/stage-7/read#joins |
| stage-7-c16 | Counting rows versus values | count | quiz / easy | COUNT(*) | /dashboard/learn/stage-7/read#aggregation-group-by-and-having |
| stage-7-c17 | Grouping before filtering totals | having | quiz / medium | HAVING COUNT(*) > 5 | /dashboard/learn/stage-7/read#aggregation-group-by-and-having |
| stage-7-c18 | Nulls in average | aggregates | quiz / medium | 15 | /dashboard/learn/stage-7/read#aggregation-group-by-and-having |
| stage-7-c19 | Empty aggregate count | count | quiz / easy | 0 | /dashboard/learn/stage-7/read#aggregation-group-by-and-having |
| stage-7-c20 | Nonaggregated projected columns | group-by | quiz / medium | It defines which rows contribute to each department total | /dashboard/learn/stage-7/read#aggregation-group-by-and-having |
| stage-7-c21 | Existence does not need a projected value | subquery | quiz / medium | Whether the subquery returns at least one row | /dashboard/learn/stage-7/read#subqueries-and-in |
| stage-7-c22 | Correlated subquery context | subquery | quiz / medium | It refers to values from the surrounding query | /dashboard/learn/stage-7/read#subqueries-and-in |
| stage-7-c23 | Primary-key guarantees | primary-key | quiz / easy | Uniqueness and non-nullness | /dashboard/learn/stage-7/read#schema-design-keys-and-normalisation |
| stage-7-c24 | Foreign keys enforce relationships | foreign-key | quiz / easy | Referential integrity between related rows | /dashboard/learn/stage-7/read#schema-design-keys-and-normalisation |
| stage-7-c25 | An optional relationship | foreign-keys | quiz / medium | Yes, unless other constraints prohibit it | /dashboard/learn/stage-7/read#schema-design-keys-and-normalisation |
| stage-7-c26 | Composite identity | keys | quiz / medium | UNIQUE(user_id, team_id) | /dashboard/learn/stage-7/read#schema-design-keys-and-normalisation |
| stage-7-c27 | Prevent an invalid price | constraints | quiz / easy | CHECK (price >= 0) | /dashboard/learn/stage-7/read#schema-design-keys-and-normalisation |
| stage-7-c28 | Normalization avoids update anomalies | normalisation | quiz / medium | To reduce inconsistent duplicate facts during updates | /dashboard/learn/stage-7/read#schema-design-keys-and-normalisation |
| stage-7-c29 | Second normal form dependency | 2nf | quiz / hard | A partial dependency on a proper subset of the key | /dashboard/learn/stage-7/read#schema-design-keys-and-normalisation |
| stage-7-c30 | Index maintenance costs | indexes | quiz / easy | Indexes consume storage and add write maintenance work | /dashboard/learn/stage-7/read#indexes-and-the-query-planner |
| stage-7-c31 | Leading columns of a B-tree index | composite-index | quiz / hard | WHERE country = 'IN' AND city = 'Delhi' | /dashboard/learn/stage-7/read#indexes-and-the-query-planner |
| stage-7-c32 | A planner is allowed not to use an index | query-planner | quiz / medium | The estimated scan cost is lower for the requested rows | /dashboard/learn/stage-7/read#indexes-and-the-query-planner |
| stage-7-c33 | Explain versus execute | explain | quiz / hard | It actually executes the statement while measuring it | /dashboard/learn/stage-7/read#indexes-and-the-query-planner |
| stage-7-c34 | Atomic transaction failure | acid | quiz / easy | Its changes commit as a unit or are rolled back as a unit | /dashboard/learn/stage-7/read#transactions-and-isolation |
| stage-7-c35 | Rollback to a savepoint | savepoint | quiz / medium | Undoing later work without discarding all earlier transaction work | /dashboard/learn/stage-7/read#transactions-and-isolation |
| stage-7-c36 | Dirty read definition | anomalies | quiz / medium | Reading data written by another transaction before it commits | /dashboard/learn/stage-7/read#transactions-and-isolation |
| stage-7-c37 | Serializable conflicts still need handling | isolation-levels | quiz / hard | The database may abort transactions to preserve serializable behavior | /dashboard/learn/stage-7/read#transactions-and-isolation |
| stage-7-c38 | Lost update through read-modify-write | transactions | quiz / hard | One increment is lost | /dashboard/learn/stage-7/read#transactions-and-isolation |
| stage-7-c39 | Migration compatibility window | migrations | quiz / medium | Old and new application versions may run simultaneously | /dashboard/learn/stage-7/read#migrations |
| stage-7-c40 | N plus one queries | n-plus-one | quiz / medium | One query loads N rows and N more queries load their related data | /dashboard/learn/stage-7/read#indexes-and-the-query-planner |

## stage-8 — 40 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-8-c01 | Staged snapshot | staging | quiz / easy | The version staged by git add, not the later unstaged edit | /dashboard/learn/stage-8/read#git-s-mental-model |
| stage-8-c02 | Inspect unstaged differences | git | quiz / easy | Working-tree tracked content against the index | /dashboard/learn/stage-8/read#git-s-mental-model |
| stage-8-c03 | Inspect staged differences | index | quiz / easy | git diff --cached | /dashboard/learn/stage-8/read#git-s-mental-model |
| stage-8-c04 | Ignore does not untrack | tracking | quiz / medium | It remains tracked until explicitly removed from the index | /dashboard/learn/stage-8/read#git-s-mental-model |
| stage-8-c05 | Commit identity versus branch name | commit | quiz / medium | A movable reference to a commit | /dashboard/learn/stage-8/read#git-s-mental-model |
| stage-8-c06 | Fetch does not integrate automatically | remotes | quiz / easy | Downloads remote objects and updates configured remote-tracking refs | /dashboard/learn/stage-8/read#branching-merging-and-rebasing |
| stage-8-c07 | Fast-forward merge | merge | quiz / medium | When the current tip is an ancestor of the target tip | /dashboard/learn/stage-8/read#branching-merging-and-rebasing |
| stage-8-c08 | Merge conflict resolution | merge-conflict | quiz / easy | git add followed by completing the merge | /dashboard/learn/stage-8/read#branching-merging-and-rebasing |
| stage-8-c09 | Rebase changes commit identity | rebase | quiz / medium | Replayed commits usually receive new identities | /dashboard/learn/stage-8/read#branching-merging-and-rebasing |
| stage-8-c10 | Detached HEAD | history | quiz / medium | HEAD points directly to a commit instead of a local branch | /dashboard/learn/stage-8/read#branching-merging-and-rebasing |
| stage-8-c11 | Undo shared work with a new commit | revert | quiz / easy | git revert | /dashboard/learn/stage-8/read#undoing-things-safely |
| stage-8-c12 | Unstage without discarding edits | restore | quiz / medium | git restore --staged file.txt | /dashboard/learn/stage-8/read#undoing-things-safely |
| stage-8-c13 | Hard reset risk | reset | quiz / easy | It can discard tracked working-tree and index changes | /dashboard/learn/stage-8/read#undoing-things-safely |
| stage-8-c14 | Untracked files in a stash | stash | quiz / medium | It includes untracked files, but not ignored files | /dashboard/learn/stage-8/read#undoing-things-safely |
| stage-8-c15 | A removed diff line | unified-diff | quiz / easy | A line removed from the old version | /dashboard/learn/stage-8/read#reading-diffs |
| stage-8-c16 | A context diff line | unified-diff | quiz / easy | To locate and understand the surrounding change | /dashboard/learn/stage-8/read#reading-diffs |
| stage-8-c17 | A focused unit test | unit-tests | quiz / easy | Call it with known inputs and assert the returned total | /dashboard/learn/stage-8/read#testing-levels-and-structure |
| stage-8-c18 | An integration boundary | test-levels | quiz / medium | Send a request against an isolated test service and inspect stored state | /dashboard/learn/stage-8/read#testing-levels-and-structure |
| stage-8-c19 | Arrange, act, assert | arrange-act-assert | quiz / easy | Assert | /dashboard/learn/stage-8/read#testing-levels-and-structure |
| stage-8-c20 | Boundary-value testing | testing | quiz / medium | 0, 1, 10, 11 | /dashboard/learn/stage-8/read#testing-levels-and-structure |
| stage-8-c21 | Regression test purpose | testing | quiz / easy | Detect reintroduction of the failing behavior | /dashboard/learn/stage-8/read#testing-levels-and-structure |
| stage-8-c22 | A test must observe its async work | test-structure | quiz / medium | Otherwise the test may finish before the operation settles | /dashboard/learn/stage-8/read#testing-levels-and-structure |
| stage-8-c23 | Stub a dependency result | test-doubles | quiz / medium | Supply controlled responses from a dependency | /dashboard/learn/stage-8/read#test-doubles-and-determinism |
| stage-8-c24 | Observe calls with a spy | spies | quiz / easy | Whether a function was called with expected arguments | /dashboard/learn/stage-8/read#test-doubles-and-determinism |
| stage-8-c25 | Fake clocks remove waiting | determinism | quiz / medium | They let the test advance time without real waiting | /dashboard/learn/stage-8/read#test-doubles-and-determinism |
| stage-8-c26 | Random tests need reproducibility | flaky-tests | quiz / medium | Record and reuse the random seed and failing case | /dashboard/learn/stage-8/read#test-doubles-and-determinism |
| stage-8-c27 | Tests should not depend on order | determinism | quiz / medium | Isolate or reset the shared state between tests | /dashboard/learn/stage-8/read#test-doubles-and-determinism |
| stage-8-c28 | Lockfile records a resolution | lockfiles | quiz / easy | The resolved dependency versions and related metadata | /dashboard/learn/stage-8/read#packages-lockfiles-and-reproducibility |
| stage-8-c29 | npm ci mismatch behavior | npm | quiz / medium | Fails instead of updating the lockfile to resolve the mismatch | /dashboard/learn/stage-8/read#packages-lockfiles-and-reproducibility |
| stage-8-c30 | Development dependency scope | tooling | quiz / easy | The linter package | /dashboard/learn/stage-8/read#packages-lockfiles-and-reproducibility |
| stage-8-c31 | Semantic version major change | semver | quiz / easy | Major | /dashboard/learn/stage-8/read#semantic-versioning |
| stage-8-c32 | Semantic version bug fix | versioning | quiz / easy | Patch | /dashboard/learn/stage-8/read#semantic-versioning |
| stage-8-c33 | Version components are numeric | comparison | quiz / medium | 2.10.0 | /dashboard/learn/stage-8/read#semantic-versioning |
| stage-8-c34 | Prerelease precedence | semver | quiz / medium | 1.4.0 | /dashboard/learn/stage-8/read#semantic-versioning |
| stage-8-c35 | Formatting versus correctness | formatting | quiz / easy | Proof that the program behavior is correct | /dashboard/learn/stage-8/read#linting-formatting-and-ci |
| stage-8-c36 | Static linting limits | linting | quiz / medium | Static rules do not establish every runtime behavior | /dashboard/learn/stage-8/read#linting-formatting-and-ci |
| stage-8-c37 | A failing CI gate | ci | quiz / easy | Block promotion until the failure is addressed | /dashboard/learn/stage-8/read#linting-formatting-and-ci |
| stage-8-c38 | Do not test against production data | testing | quiz / easy | An isolated test database with disposable data | /dashboard/learn/stage-8/read#testing-levels-and-structure |
| stage-8-c39 | Bisect requires a verdict | debugging | quiz / medium | A good-or-bad verdict for tested revisions | /dashboard/learn/stage-8/read#debugging-with-git |
| stage-8-c40 | Property tests describe relationships | testing | quiz / hard | Its output is ordered and preserves the input multiset | /dashboard/learn/stage-8/read#testing-levels-and-structure |

## stage-9 — 40 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-9-c01 | Horizontal versus vertical scaling | horizontal-scaling | quiz / easy | Adding more application instances | /dashboard/learn/stage-9/read#scaling-and-statelessness |
| stage-9-c02 | Stateless application replicas | statelessness | quiz / medium | Any eligible replica can handle the next request | /dashboard/learn/stage-9/read#scaling-and-statelessness |
| stage-9-c03 | A downstream bottleneck remains | capacity | quiz / medium | The database bottleneck and workload reaching it | /dashboard/learn/stage-9/read#scaling-and-statelessness |
| stage-9-c04 | Scaling includes coordination cost | scaling | quiz / hard | Shared bottlenecks and coordination overhead can limit gains | /dashboard/learn/stage-9/read#scaling-and-statelessness |
| stage-9-c05 | Round robin distributes requests | round-robin | quiz / easy | The available backend instances in sequence | /dashboard/learn/stage-9/read#load-balancing-and-health-checks |
| stage-9-c06 | Readiness versus process existence | health-checks | quiz / medium | Not ready to receive traffic yet | /dashboard/learn/stage-9/read#load-balancing-and-health-checks |
| stage-9-c07 | Least connections is a heuristic | least-connections | quiz / medium | A backend with fewer active connections | /dashboard/learn/stage-9/read#load-balancing-and-health-checks |
| stage-9-c08 | Draining before termination | load-balancing | quiz / medium | To let in-flight work finish while new work goes elsewhere | /dashboard/learn/stage-9/read#load-balancing-and-health-checks |
| stage-9-c09 | Cache-aside miss path | cache-aside | quiz / easy | Read the authoritative store and populate the cache | /dashboard/learn/stage-9/read#caching |
| stage-9-c10 | TTL is a freshness trade-off | ttl | quiz / medium | Cached values may remain stale for longer | /dashboard/learn/stage-9/read#caching |
| stage-9-c11 | Stampede after expiration | cache-stampede | quiz / medium | Coalesce concurrent fetches for that key | /dashboard/learn/stage-9/read#caching |
| stage-9-c12 | Negative caching | caching | quiz / medium | A temporary result indicating a lookup found no item | /dashboard/learn/stage-9/read#caching |
| stage-9-c13 | An eviction policy is not freshness | eviction | quiz / hard | No, recency and source freshness are separate | /dashboard/learn/stage-9/read#caching |
| stage-9-c14 | Invalidation ordering | invalidation | quiz / hard | Readers might otherwise receive the old cached representation | /dashboard/learn/stage-9/read#caching |
| stage-9-c15 | Sharding partitions data | sharding | quiz / easy | Sharding distributes subsets; replication maintains copies | /dashboard/learn/stage-9/read#sharding-and-replication |
| stage-9-c16 | A hot partition key | hot-shard | quiz / medium | That shard can become a bottleneck despite spare capacity elsewhere | /dashboard/learn/stage-9/read#sharding-and-replication |
| stage-9-c17 | Shard-key query locality | partition-key | quiz / hard | Queries with that key can often target fewer shards | /dashboard/learn/stage-9/read#sharding-and-replication |
| stage-9-c18 | Replication lag | replication-lag | quiz / medium | The replica has not applied the write yet | /dashboard/learn/stage-9/read#sharding-and-replication |
| stage-9-c19 | Read your own recent write | read-your-writes | quiz / medium | Route the dependent read to a sufficiently up-to-date source | /dashboard/learn/stage-9/read#consistency-cap-and-read-your-writes |
| stage-9-c20 | Replication is not a historical backup | replication | quiz / medium | The deletion may replicate to the other copies | /dashboard/learn/stage-9/read#sharding-and-replication |
| stage-9-c21 | CAP under a partition | cap-theorem | quiz / hard | Maintaining linearizable consistency while answering every request | /dashboard/learn/stage-9/read#consistency-cap-and-read-your-writes |
| stage-9-c22 | Eventual convergence assumption | eventual-consistency | quiz / medium | Replicas eventually converge on the same state | /dashboard/learn/stage-9/read#consistency-cap-and-read-your-writes |
| stage-9-c23 | Consistency requirement comes from use | consistency | quiz / hard | Ensuring a limited inventory item is not sold beyond available stock | /dashboard/learn/stage-9/read#consistency-cap-and-read-your-writes |
| stage-9-c24 | Queue decouples timing | message-queues | quiz / easy | Producers and workers can operate at different rates | /dashboard/learn/stage-9/read#message-queues-and-back-pressure |
| stage-9-c25 | At-least-once means duplicates are possible | message-queues | quiz / medium | Receiving the same logical message more than once | /dashboard/learn/stage-9/read#message-queues-and-back-pressure |
| stage-9-c26 | Acknowledge after durable work | message-queues | quiz / hard | The queue may remove work whose effect never completed | /dashboard/learn/stage-9/read#message-queues-and-back-pressure |
| stage-9-c27 | Dead-letter queue purpose | message-queues | quiz / medium | Isolating repeatedly failing messages for inspection and controlled retry | /dashboard/learn/stage-9/read#message-queues-and-back-pressure |
| stage-9-c28 | Back-pressure protects downstream capacity | back-pressure | quiz / medium | Slow or reject new work when capacity limits are reached | /dashboard/learn/stage-9/read#message-queues-and-back-pressure |
| stage-9-c29 | Deduplicate a retried payment intent | idempotency | quiz / hard | Return the recorded outcome without performing the charge twice | /dashboard/learn/stage-9/read#idempotency-and-retries |
| stage-9-c30 | Exponential backoff | retries | quiz / medium | The waiting interval grows across successive failures | /dashboard/learn/stage-9/read#idempotency-and-retries |
| stage-9-c31 | Jitter spreads retry load | retries | quiz / medium | To reduce synchronized retry bursts | /dashboard/learn/stage-9/read#idempotency-and-retries |
| stage-9-c32 | Retry only appropriate failures | retries | quiz / hard | A deterministic validation error for malformed input | /dashboard/learn/stage-9/read#idempotency-and-retries |
| stage-9-c33 | Timeouts bound waiting | resilience | quiz / easy | To bound how long resources wait for a response | /dashboard/learn/stage-9/read#resilience-timeouts-circuit-breakers-bulkheads |
| stage-9-c34 | Circuit breaker open state | circuit-breaker | quiz / medium | Fail fast or use a defined fallback without making normal calls | /dashboard/learn/stage-9/read#resilience-timeouts-circuit-breakers-bulkheads |
| stage-9-c35 | Circuit breaker half-open probe | circuit-breaker | quiz / hard | Allow a limited number of probes to test recovery | /dashboard/learn/stage-9/read#resilience-timeouts-circuit-breakers-bulkheads |
| stage-9-c36 | Bulkhead isolation | fault-tolerance | quiz / medium | One exhausted pool need not consume every other service allocation | /dashboard/learn/stage-9/read#resilience-timeouts-circuit-breakers-bulkheads |
| stage-9-c37 | Trace a request across services | tracing | quiz / easy | Related operations across multiple service boundaries | /dashboard/learn/stage-9/read#observability-logs-metrics-traces |
| stage-9-c38 | High-cardinality metric labels | metrics | quiz / hard | It can create too many distinct time series | /dashboard/learn/stage-9/read#observability-logs-metrics-traces |
| stage-9-c39 | Rate limiting versus concurrency limiting | throttling | quiz / hard | A concurrency limit | /dashboard/learn/stage-9/read#rate-limiting-and-throttling |
| stage-9-c40 | Correlation is not root cause | debugging | quiz / medium | Investigate evidence and compare behavior before attributing cause | /dashboard/learn/stage-9/read#debugging-distributed-systems |

## stage-10 — 40 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-10-c01 | Promote the tested artifact | reproducible-builds | quiz / medium | To avoid deploying a different rebuild from the one tested | /dashboard/learn/stage-10/read#ci-cd-pipelines |
| stage-10-c02 | Fail early in a pipeline | fail-fast | quiz / easy | It can reject invalid code before expensive later work | /dashboard/learn/stage-10/read#ci-cd-pipelines |
| stage-10-c03 | An artifact tied to a revision | ci-cd | quiz / easy | The source commit identifier recorded with the artifact | /dashboard/learn/stage-10/read#ci-cd-pipelines |
| stage-10-c04 | Protected deployment credentials | pipelines | quiz / medium | Do not expose them to that untrusted execution context | /dashboard/learn/stage-10/read#ci-cd-pipelines |
| stage-10-c05 | Canary before broad rollout | canary | quiz / easy | Observe impact while limiting initial exposure | /dashboard/learn/stage-10/read#deployment-strategies-and-rollback |
| stage-10-c06 | Blue-green traffic switch | blue-green | quiz / medium | Two deployment environments with traffic switched between them | /dashboard/learn/stage-10/read#deployment-strategies-and-rollback |
| stage-10-c07 | Rolling deployment compatibility | rolling | quiz / medium | Both versions may serve traffic at the same time | /dashboard/learn/stage-10/read#deployment-strategies-and-rollback |
| stage-10-c08 | Rollback cannot undo every data change | rollback | quiz / hard | The old data may already have been removed or transformed | /dashboard/learn/stage-10/read#deployment-strategies-and-rollback |
| stage-10-c09 | Graceful shutdown sequence | zero-downtime | quiz / medium | Stop new traffic, finish bounded in-flight work, then exit | /dashboard/learn/stage-10/read#deployment-strategies-and-rollback |
| stage-10-c10 | A flag is not authorization | feature-flags | quiz / medium | Server-side authorization for protected operations | /dashboard/learn/stage-10/read#feature-flags-and-gradual-rollout |
| stage-10-c11 | Stable rollout cohorts | rollout | quiz / medium | To avoid users repeatedly switching behavior between requests | /dashboard/learn/stage-10/read#feature-flags-and-gradual-rollout |
| stage-10-c12 | Retire completed feature flags | feature-flags | quiz / easy | To reduce dead branches and combinations that must be maintained | /dashboard/learn/stage-10/read#feature-flags-and-gradual-rollout |
| stage-10-c13 | A committed secret needs rotation | secrets | quiz / medium | Revoke or rotate it because history or copies may expose it | /dashboard/learn/stage-10/read#configuration-and-secrets |
| stage-10-c14 | Frontend build variables are public | environment-config | quiz / medium | Users can inspect the delivered bundle | /dashboard/learn/stage-10/read#configuration-and-secrets |
| stage-10-c15 | Validate configuration at startup | validation | quiz / easy | To fail clearly before requests encounter inconsistent setup | /dashboard/learn/stage-10/read#configuration-and-secrets |
| stage-10-c16 | Least-privilege runtime identity | secrets | quiz / medium | One restricted to the required read access | /dashboard/learn/stage-10/read#configuration-and-secrets |
| stage-10-c17 | Expand then backfill | migrations | quiz / hard | Add compatibly, backfill, migrate writers, then enforce the requirement | /dashboard/learn/stage-10/read#database-migrations-in-production |
| stage-10-c18 | Retryable backfill chunks | migrations | quiz / medium | Large migrations may fail after partially completed work | /dashboard/learn/stage-10/read#database-migrations-in-production |
| stage-10-c19 | Verify recovery, not only backup creation | deployment | quiz / hard | A restore test that verifies recovered data and application operation | /dashboard/learn/stage-10/read#deployment-strategies-and-rollback |
| stage-10-c20 | Structured log fields | structured-logging | quiz / easy | To support reliable filtering and correlation | /dashboard/learn/stage-10/read#structured-logging-and-redaction |
| stage-10-c21 | Redact before emitting | redaction | quiz / medium | Redact sensitive fields before logs leave the application boundary | /dashboard/learn/stage-10/read#structured-logging-and-redaction |
| stage-10-c22 | Useful error correlation | structured-logging | quiz / medium | The same reference is attached to protected diagnostic logs | /dashboard/learn/stage-10/read#structured-logging-and-redaction |
| stage-10-c23 | A percentile is not a maximum | percentiles | quiz / medium | About 95 percent of observations are at or below that value | /dashboard/learn/stage-10/read#metrics-percentiles-and-aggregation |
| stage-10-c24 | Averages can hide a slow tail | latency | quiz / medium | A minority of very slow requests may be hidden by the mean | /dashboard/learn/stage-10/read#metrics-percentiles-and-aggregation |
| stage-10-c25 | Do not average percentiles blindly | aggregation | quiz / hard | Percentiles do not combine by ordinary averaging | /dashboard/learn/stage-10/read#metrics-percentiles-and-aggregation |
| stage-10-c26 | Counter versus gauge | metrics | quiz / medium | Current number of active connections | /dashboard/learn/stage-10/read#metrics-percentiles-and-aggregation |
| stage-10-c27 | Actionable paging | alerting | quiz / medium | It identifies an urgent condition with a response path | /dashboard/learn/stage-10/read#alerting-and-on-call |
| stage-10-c28 | Alert noise has a cost | on-call | quiz / easy | They can desensitize responders to important signals | /dashboard/learn/stage-10/read#alerting-and-on-call |
| stage-10-c29 | Mitigation before perfect diagnosis | incident-response | quiz / medium | Restore service safely while preserving useful evidence | /dashboard/learn/stage-10/read#incident-response-and-postmortems |
| stage-10-c30 | Blameless postmortem | postmortem | quiz / medium | System conditions, detection and recovery practices | /dashboard/learn/stage-10/read#incident-response-and-postmortems |
| stage-10-c31 | A concrete follow-up | postmortem | quiz / easy | Add a restore drill with an owner and completion date | /dashboard/learn/stage-10/read#incident-response-and-postmortems |
| stage-10-c32 | Secure cookie transport | cookies | quiz / medium | Send it only over secure transport, subject to browser rules | /dashboard/learn/stage-10/read#security-headers-and-hardening |
| stage-10-c33 | CSP as an additional layer | csp | quiz / hard | Safe output handling and appropriate sanitization | /dashboard/learn/stage-10/read#security-headers-and-hardening |
| stage-10-c34 | Reduce exposed error details | hardening | quiz / easy | They can reveal implementation and infrastructure details | /dashboard/learn/stage-10/read#security-headers-and-hardening |
| stage-10-c35 | Dependency vulnerability response | security | quiz / medium | Assess exposure and test a supported remediation promptly | /dashboard/learn/stage-10/read#security-headers-and-hardening |
| stage-10-c36 | A measurable performance budget | performance-budget | quiz / medium | A defined compressed entry-bundle size threshold checked in CI | /dashboard/learn/stage-10/read#performance-budgets |
| stage-10-c37 | Lazy loading shifts work | performance-budget | quiz / medium | Its code need not be downloaded for the initial route | /dashboard/learn/stage-10/read#performance-budgets |
| stage-10-c38 | Measure before declaring optimization | performance-budget | quiz / medium | Comparable measurements under a representative workload | /dashboard/learn/stage-10/read#performance-budgets |
| stage-10-c39 | Test graceful degradation | deployment | quiz / hard | The core purchase flow still works with a defined fallback | /dashboard/learn/stage-10/read#deployment-strategies-and-rollback |
| stage-10-c40 | Observe after deployment | deployment | quiz / easy | Real traffic and environment conditions can reveal new failures | /dashboard/learn/stage-10/read#deployment-strategies-and-rollback |

## stage-c1 — 40 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-c1-b01 | Integer division truncates | arithmetic | output_prediction / easy | 3 | No article exists for this language track |
| stage-c1-b02 | Negative division is toward zero | arithmetic | output_prediction / medium | -3 | No article exists for this language track |
| stage-c1-b03 | Promote before division | conversions | output_prediction / easy | 3.5 | No article exists for this language track |
| stage-c1-b04 | An array initializer fills the rest | arrays | output_prediction / easy | 0 | No article exists for this language track |
| stage-c1-b05 | Character array includes a terminator | strings | output_prediction / medium | 5 | No article exists for this language track |
| stage-c1-b06 | String length excludes the terminator | strings | output_prediction / easy | 4 | No article exists for this language track |
| stage-c1-b07 | Pointer dereference updates the object | pointers | output_prediction / easy | 9 | No article exists for this language track |
| stage-c1-b08 | Pointer arithmetic follows element size | pointers | output_prediction / medium | 10 | No article exists for this language track |
| stage-c1-b09 | Const pointer target can be observed | pointers | output_prediction / medium | 12 | No article exists for this language track |
| stage-c1-b10 | Logical operators produce int truth values | operators | output_prediction / easy | 1 | No article exists for this language track |
| stage-c1-b11 | Short-circuit avoids the increment | operators | output_prediction / medium | 0 0 | No article exists for this language track |
| stage-c1-b12 | Bitwise mask | bitwise | output_prediction / medium | 1 | No article exists for this language track |
| stage-c1-b13 | Switch falls through until break | control-flow | output_prediction / medium | 5 | No article exists for this language track |
| stage-c1-b14 | Continue skips an addition | loops | output_prediction / easy | 8 | No article exists for this language track |
| stage-c1-b15 | An inner declaration shadows | scope | output_prediction / medium | 3 | No article exists for this language track |
| stage-c1-b16 | Designated initializer positions | arrays | output_prediction / medium | 0 7 | No article exists for this language track |
| stage-c1-b17 | Copying a structure value | structs | output_prediction / medium | 2 9 | No article exists for this language track |
| stage-c1-b18 | Comma operator result | operators | output_prediction / hard | 3 9 | No article exists for this language track |
| stage-c1-b19 | Sizeof a non-VLA expression does not increment | sizeof | output_prediction / hard | 4 | No article exists for this language track |
| stage-c1-b20 | First null ends a C string | strings | output_prediction / medium | 2 | No article exists for this language track |
| stage-c1-b21 | Portable size of an int | types | quiz / medium | Its size is implementation-defined within standard constraints | No article exists for this language track |
| stage-c1-b22 | A C byte has a defined size unit | sizeof | quiz / easy | 1 | No article exists for this language track |
| stage-c1-b23 | Signed overflow is not wrapping arithmetic | arithmetic | quiz / hard | No defined result; signed overflow is undefined behavior | No article exists for this language track |
| stage-c1-b24 | Unsigned arithmetic wraps by its range | arithmetic | quiz / medium | Reduction modulo one more than the maximum representable value | No article exists for this language track |
| stage-c1-b25 | Uninitialized automatic integer | initialization | quiz / medium | Initialize it to a valid value | No article exists for this language track |
| stage-c1-b26 | Static storage initialization | initialization | quiz / easy | To zero | No article exists for this language track |
| stage-c1-b27 | Array argument loses bound information | arrays | quiz / hard | A pointer to int | No article exists for this language track |
| stage-c1-b28 | One-past pointer limitation | pointers | quiz / hard | Dereferencing it to read an element | No article exists for this language track |
| stage-c1-b29 | Local object lifetime | lifetime | quiz / medium | The array lifetime ends when its block execution ends | No article exists for this language track |
| stage-c1-b30 | Check allocation failure | memory | quiz / easy | Whether the returned pointer is NULL | No article exists for this language track |
| stage-c1-b31 | Release ownership once | memory | quiz / medium | Exactly once when no longer needed | No article exists for this language track |
| stage-c1-b32 | Realloc failure preservation | memory | quiz / hard | It remains allocated and valid | No article exists for this language track |
| stage-c1-b33 | Freeing null | memory | quiz / easy | No action is performed | No article exists for this language track |
| stage-c1-b34 | String literal modification | strings | quiz / medium | Attempting to modify a string literal is undefined behavior | No article exists for this language track |
| stage-c1-b35 | Formatted input needs an address | input-output | quiz / easy | scanf needs a location where it can store the parsed value | No article exists for this language track |
| stage-c1-b36 | Check scanf conversion count | input-output | quiz / medium | The number of assignments, or EOF on early input failure | No article exists for this language track |
| stage-c1-b37 | Value parameters and caller mutation | functions | quiz / easy | No, the parameter holds a passed value | No article exists for this language track |
| stage-c1-b38 | A macro argument evaluated twice | macros | quiz / hard | The expansion calls next_value twice | No article exists for this language track |
| stage-c1-b39 | Structure member through a pointer | structs | quiz / easy | (*item).count | No article exists for this language track |
| stage-c1-b40 | Bounded buffer input | input-output | quiz / medium | It bounds input by the available array size | No article exists for this language track |

## stage-cpp1 — 40 questions

| ID | Question | Topic | Type / difficulty | Correct choice | Reading section |
| --- | --- | --- | --- | --- | --- |
| stage-cpp1-b01 | A reference aliases its initializer | references | output_prediction / easy | 7 | No article exists for this language track |
| stage-cpp1-b02 | Copying an int is independent | values | output_prediction / easy | 8 2 | No article exists for this language track |
| stage-cpp1-b03 | Auto without a reference copies | auto | output_prediction / medium | 5 | No article exists for this language track |
| stage-cpp1-b04 | Auto reference retains aliasing | auto | output_prediction / medium | 6 | No article exists for this language track |
| stage-cpp1-b05 | String appending is explicit mutation | strings | output_prediction / easy | coder | No article exists for this language track |
| stage-cpp1-b06 | Substring length rather than end index | strings | output_prediction / medium | lan | No article exists for this language track |
| stage-cpp1-b07 | A string copy owns its value | strings | output_prediction / easy | cat bat | No article exists for this language track |
| stage-cpp1-b08 | Finding a missing substring | strings | output_prediction / medium | true | No article exists for this language track |
| stage-cpp1-b09 | Vector push changes size | vectors | output_prediction / easy | 3 | No article exists for this language track |
| stage-cpp1-b10 | Reserve does not create elements | vectors | output_prediction / medium | 2 | No article exists for this language track |
| stage-cpp1-b11 | Resize constructs new integers | vectors | output_prediction / medium | 0 0 | No article exists for this language track |
| stage-cpp1-b12 | Range-for by value | loops | output_prediction / medium | 2 4 | No article exists for this language track |
| stage-cpp1-b13 | Range-for by reference | loops | output_prediction / medium | 4 8 | No article exists for this language track |
| stage-cpp1-b14 | Sorting a vector in place | algorithms | output_prediction / easy | 1 5 | No article exists for this language track |
| stage-cpp1-b15 | Accumulate starts from the supplied initial value | algorithms | output_prediction / medium | 15 | No article exists for this language track |
| stage-cpp1-b16 | Set insertion deduplicates | containers | output_prediction / easy | 2 | No article exists for this language track |
| stage-cpp1-b17 | Map subscript inserts a missing integer | containers | output_prediction / medium | 0 1 | No article exists for this language track |
| stage-cpp1-b18 | A lambda captures a snapshot | lambdas | output_prediction / hard | 3 | No article exists for this language track |
| stage-cpp1-b19 | A lambda captures a reference | lambdas | output_prediction / hard | 8 | No article exists for this language track |
| stage-cpp1-b20 | A class constructor initializes a member | classes | output_prediction / medium | 7 | No article exists for this language track |
| stage-cpp1-b21 | Reference initialization | references | quiz / easy | An initializer binding it to a suitable object | No article exists for this language track |
| stage-cpp1-b22 | Reference assignment does not rebind | references | quiz / medium | Assigns the value of second into first | No article exists for this language track |
| stage-cpp1-b23 | Const reference parameter | functions | quiz / easy | Avoid a parameter copy while preventing mutation through that reference | No article exists for this language track |
| stage-cpp1-b24 | Returning a local reference | lifetime | quiz / medium | The referred object is destroyed when the function exits | No article exists for this language track |
| stage-cpp1-b25 | RAII resource release | raii | quiz / medium | Tie resource ownership and release to object lifetime | No article exists for this language track |
| stage-cpp1-b26 | Unique ownership pointer | ownership | quiz / medium | Exclusive ownership transferable by move | No article exists for this language track |
| stage-cpp1-b27 | Shared ownership cycle | ownership | quiz / hard | Their reference counts can keep both objects alive | No article exists for this language track |
| stage-cpp1-b28 | Move is a cast, not an operation by itself | move-semantics | quiz / hard | Casts the expression to permit move-aware overload selection | No article exists for this language track |
| stage-cpp1-b29 | Moved-from string assumptions | move-semantics | quiz / hard | It is valid but its value is generally unspecified | No article exists for this language track |
| stage-cpp1-b30 | Vector reallocation invalidates references | vectors | quiz / hard | They are invalidated | No article exists for this language track |
| stage-cpp1-b31 | Bounds-checked vector access | vectors | quiz / easy | at | No article exists for this language track |
| stage-cpp1-b32 | End iterator is a boundary | iterators | quiz / medium | A past-the-end iterator, not an element to dereference | No article exists for this language track |
| stage-cpp1-b33 | Erase returns a continuation iterator | iterators | quiz / medium | Use the iterator returned by erase | No article exists for this language track |
| stage-cpp1-b34 | Default access of class versus struct | classes | quiz / easy | class members are private; struct members are public | No article exists for this language track |
| stage-cpp1-b35 | Const-qualified member function | classes | quiz / medium | It does not modify non-mutable members through this | No article exists for this language track |
| stage-cpp1-b36 | Override catches signature mistakes | inheritance | quiz / medium | The compiler checks that it really overrides a base virtual function | No article exists for this language track |
| stage-cpp1-b37 | Polymorphic deletion | inheritance | quiz / hard | A suitable virtual destructor | No article exists for this language track |
| stage-cpp1-b38 | Catch exceptions without slicing | exceptions | quiz / medium | It avoids copying and preserves polymorphic exception information | No article exists for this language track |
| stage-cpp1-b39 | nullptr has a pointer-oriented type | pointers | quiz / easy | It distinguishes null-pointer intent from an int argument | No article exists for this language track |
| stage-cpp1-b40 | Use standard value-owning members | classes | quiz / medium | Those members already manage their own resource lifetimes | No article exists for this language track |
