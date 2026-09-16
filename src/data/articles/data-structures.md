# Data Structures: picking the right container

> A data structure is a promise about cost: what is cheap, what is expensive, what is impossible. This article covers arrays, hash maps, sets, linked lists, stacks, queues, trees, heaps, tries and graphs - and when each one earns its keep.

## Complexity and trade-offs
<!-- tags: complexity, trade-offs, data-structures -->

Big-O describes how cost grows with input size, ignoring constants. The ladder you will use daily: **O(1)** constant, **O(log n)** halving, **O(n)** one pass, **O(n log n)** sorting, **O(n²)** nested loops.

Choosing a structure is choosing which operations are O(1). An array indexes in O(1) but inserts at the front in O(n); a linked list is the reverse. A hash map looks up by key in O(1) but has no order; a balanced tree keeps order and looks up in O(log n). There is no best structure, only the best one for the operations your problem does most.

## Dynamic arrays
<!-- tags: arrays, dynamic-array, amortised -->

JavaScript arrays and Python lists are **dynamic arrays**: a contiguous block of memory that is reallocated - usually doubled - when it fills up.

- Index read/write: O(1).
- Append at the end: O(1) *amortised*. Most pushes are free; occasionally one push copies everything into a bigger block, and averaged over many pushes that costs O(1) each.
- Insert or delete at the front or middle: O(n), because every later element shifts.
- Search by value: O(n), unless the array is sorted (then binary search, O(log n)).

Copying is O(n) too, which is why `arr.slice()` inside a loop quietly turns an O(n) algorithm into O(n²).

## Hash maps and sets
<!-- tags: hash-map, map, set, objects, collisions, chaining, counting, dedup, two-sum, reference-identity, iteration -->

A hash map turns a key into a bucket index with a **hash function**, giving O(1) average insert, lookup and delete. Two keys landing in the same bucket is a **collision**; the usual fix is **chaining** - each bucket holds a small list - and resizing when buckets get crowded. Worst case (everything collides) is O(n), which is why hash functions matter.

In JavaScript, `Map` is the general-purpose hash map. Plain objects work for string keys but stringify everything else: `obj[[1,2]]` and `obj["1,2"]` are the same slot. `Map` compares keys by **reference identity**, so two distinct arrays with the same contents are two different keys, and it keeps insertion order when you iterate.

```javascript
// Count occurrences
const counts = new Map();
for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);

// Two-sum: have we seen the complement?
function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}
```

A `Set` is a map without values: `new Set(list)` deduplicates in O(n), and `set.has(x)` replaces `list.includes(x)` when membership is checked repeatedly.

## Stacks and queues
<!-- tags: stack, queue, fifo, brackets, parsing -->

A **stack** is last-in, first-out: `push` and `pop` at the same end. Arrays do this natively. Stacks model anything nested - matching brackets, undo history, the call stack itself.

```javascript
function balanced(s) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const ch of s) {
    if ("([{".includes(ch)) stack.push(ch);
    else if (ch in pairs && stack.pop() !== pairs[ch]) return false;
  }
  return stack.length === 0;
}
```

A **queue** is first-in, first-out. `array.shift()` works but is O(n); for real workloads use two indices, a linked list, or a ring buffer. Queues drive breadth-first search and any "process in arrival order" pipeline.

## Linked lists and pointers
<!-- tags: linked-list, pointers, traversal -->

A linked list is a chain of nodes, each holding a value and a pointer to the next. Insert or delete at a known node is O(1) - just rewire pointers - but reaching the n-th node is O(n), because there is no index.

```javascript
// Reverse in place: three pointers, walk once.
function reverse(head) {
  let prev = null, cur = head;
  while (cur) {
    const next = cur.next;   // save before we overwrite it
    cur.next = prev;         // flip the arrow
    prev = cur; cur = next;  // advance
  }
  return prev;
}
```

Most linked-list bugs are pointer-order bugs: overwriting `next` before saving it, or forgetting to move the head. Draw the boxes and arrows. The **fast and slow pointer** trick (one advances two steps, the other one) finds the middle in one pass and detects cycles: if there is a loop, fast eventually laps slow.

## Trees and binary search trees
<!-- tags: binary-tree, bst, preorder, recursion, insert, search -->

A tree is nodes with children and no cycles. A **binary tree** has at most two children per node. Traversals visit every node in a defined order:

- **Pre-order**: node, left, right - copying or serialising a tree.
- **In-order**: left, node, right - on a BST this yields sorted order.
- **Post-order**: left, right, node - deleting or evaluating expression trees.

A **binary search tree** keeps the invariant *left < node < right*. Search and insert follow one path from the root, O(h) where h is the height - O(log n) if balanced, O(n) if the tree degenerates into a list (insert sorted input into a naive BST to see it happen).

```javascript
function insert(node, value) {
  if (!node) return { value, left: null, right: null };
  if (value < node.value) node.left = insert(node.left, value);
  else node.right = insert(node.right, value);
  return node;
}
```

Recursion fits trees because every subtree is itself a tree. Self-balancing variants (AVL, red-black) do rotations to keep h logarithmic; production libraries use them for you.

## Heaps and priority queues
<!-- tags: heap, priority-queue, sift-down -->

A **priority queue** gives you the smallest (or largest) item next, whatever order things arrived. The standard implementation is a **binary heap**: a complete binary tree stored in an array, where each parent is ≤ its children (min-heap). For index `i`, children are `2i+1` and `2i+2`, parent is `⌊(i-1)/2⌋`.

- Peek min: O(1) - it is at index 0.
- Insert: append, then **sift up** while smaller than the parent. O(log n).
- Remove min: move the last element to the root, then **sift down** swapping with the smaller child. O(log n).

Heaps power "top k", Dijkstra's algorithm, schedulers and merging k sorted lists. The array layout has no pointers, so it is cache-friendly and compact.

## Tries
<!-- tags: trie, prefix, strings -->

A **trie** (prefix tree) stores strings one character per level, so all words sharing a prefix share a path. Insert and lookup are O(length of the word), independent of how many words are stored. Autocomplete, spell-checking and IP routing tables are tries.

```javascript
function insert(root, word) {
  let node = root;
  for (const ch of word) node = node.children[ch] ??= { children: {}, end: false };
  node.end = true;
}
```

The cost is memory: many small nodes. Compressed tries (radix trees) merge single-child chains to fix that.

## Graphs: representation and traversal
<!-- tags: graph, adjacency-list, adjacency-matrix, bfs -->

A graph is nodes and edges. Two representations:

- **Adjacency list**: for each node, the list of its neighbours. O(V + E) memory. The default choice.
- **Adjacency matrix**: a V×V grid of booleans or weights. O(V²) memory, O(1) edge lookup. Good for dense graphs.

**Breadth-first search** explores level by level with a queue, and on an unweighted graph the first time you reach a node is along a shortest path. **Depth-first search** goes deep with a stack or recursion, and is the basis for cycle detection and topological sort.

```javascript
function bfs(adj, start) {
  const dist = new Map([[start, 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {      // index instead of shift(): O(1)
    const node = queue[i];
    for (const next of adj.get(node) ?? []) {
      if (!dist.has(next)) { dist.set(next, dist.get(node) + 1); queue.push(next); }
    }
  }
  return dist;
}
```

Always track visited nodes; without that, any cycle loops forever.

## Putting it together: an LRU cache
<!-- tags: lru -->

An LRU (least-recently-used) cache evicts the entry that has gone longest without being touched. It needs O(1) lookup **and** O(1) "move to most recent", which no single structure gives - so it combines two: a hash map for lookup and a doubly linked list for recency order.

In JavaScript, `Map` remembers insertion order, so deleting a key and re-setting it moves it to the end - and the first key in iteration order is the least recent. Stage 03's test asks you to build exactly this.
