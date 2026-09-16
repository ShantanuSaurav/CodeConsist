# Algorithms: the patterns behind the problems
<!-- stage: stage-4 -->

> Most interview and real-world problems are one of a dozen patterns wearing different clothes. This article names them - two pointers, sliding window, binary search, sorting, recursion, dynamic programming, greedy, graph search - and shows how to recognise each.

## Big-O and counting loops
<!-- tags: big-o, complexity, nested-loops, loops -->

Estimate cost by counting how many times the innermost line runs. One loop over n items: O(n). A loop inside a loop, both over n: O(n²). A loop that halves the remaining range each step: O(log n). A sort followed by a scan: O(n log n) + O(n) = O(n log n), because the bigger term wins.

```javascript
for (let i = 0; i < n; i++)          // n times
  for (let j = i + 1; j < n; j++)    // about n/2 on average
    count++;                         // ~n²/2 total -> O(n²)
```

Constants and lower-order terms are dropped, so O(3n + 10) is O(n). That does not mean constants never matter - in practice an O(n log n) sort often beats a "clever" O(n) solution with heavy constants. Big-O tells you how a solution *scales*, which is what matters when inputs grow.

## Two pointers
<!-- tags: two-pointers, arrays, in-place, sorted-array, partitioning, dutch-national-flag -->

Two indices that move through an array according to a rule. Three shapes come up again and again:

**Converging** - start at both ends, move inward. Pair-sum in a sorted array: if the sum is too small, advance `lo`; too big, retreat `hi`.

**Reader/writer** - one pointer reads every element, the other marks where the next kept element goes. This is how you remove duplicates or move zeros **in place** in O(n) with O(1) space.

```javascript
function removeDuplicates(sorted) {
  let write = 0;
  for (let read = 0; read < sorted.length; read++) {
    if (read === 0 || sorted[read] !== sorted[read - 1]) sorted[write++] = sorted[read];
  }
  return write;   // new length; the first `write` slots hold the answer
}
```

**Three-way partition** (the *Dutch national flag*) - `lo`, `mid`, `hi` pointers sort an array of three values in one pass: values below the pivot go before `lo`, above go after `hi`, and `mid` scans. It is the heart of quicksort's partition step.

## Sliding window
<!-- tags: sliding-window, subarrays, strings -->

When a problem asks about **contiguous** subarrays or substrings - longest without repeats, smallest with sum ≥ k, count with at most k distinct - grow a window from the right and shrink it from the left while a condition is violated. Each index enters and leaves the window at most once, so the whole thing is O(n).

```javascript
function lengthOfLongestSubstring(s) {
  const lastSeen = new Map();
  let left = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (lastSeen.has(ch) && lastSeen.get(ch) >= left) left = lastSeen.get(ch) + 1;
    lastSeen.set(ch, right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}
```

The window is `[left, right]`; the invariant is "the window has no repeated characters". Fixed-size windows are the simpler cousin: add the entering element, subtract the leaving one.

## Prefix sums
<!-- tags: prefix-sums, range-query, kadane -->

A **prefix sum** array stores running totals: `prefix[i]` is the sum of the first `i` elements. Then any range sum is one subtraction, `prefix[j] - prefix[i]`, turning O(n) per query into O(1) after O(n) setup.

**Kadane's algorithm** for the maximum subarray is prefix-sum thinking without the array: walk once, keeping the best sum ending *here* - either extend the previous run or start fresh.

```javascript
function maxSubarray(nums) {
  let best = nums[0], current = nums[0];
  for (let i = 1; i < nums.length; i++) {
    current = Math.max(nums[i], current + nums[i]);
    best = Math.max(best, current);
  }
  return best;
}
```

## Binary search and invariants
<!-- tags: binary-search, invariants, off-by-one, search -->

Binary search works on anything **monotonic**: a sorted array, but also "the smallest x for which `ok(x)` is true" when `ok` flips from false to true exactly once. Halve the range each step: O(log n).

The bugs are all at the boundaries, so state the **invariant** and keep it true: for example "the answer, if it exists, is in `[lo, hi]`".

```javascript
function lowerBound(sorted, target) {   // first index with sorted[i] >= target
  let lo = 0, hi = sorted.length;       // answer is in [lo, hi]
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);  // no overflow, floors
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
```

Decide up front whether `hi` is inclusive or exclusive and stick to it. `mid` must always move `lo` or `hi` strictly, or the loop never ends.

## Sorting: algorithms, stability, comparators
<!-- tags: sorting, quicksort, stability, comparators, merge, divide-and-conquer -->

Know four sorts and what they are for:

- **Insertion sort** - O(n²), but the fastest on tiny or nearly-sorted inputs. Real libraries use it for small partitions.
- **Merge sort** - O(n log n) always, **stable**, needs O(n) extra space. *Divide and conquer*: sort halves, then merge two sorted lists in one pass.
- **Quicksort** - O(n log n) average, in place, not stable; O(n²) on a bad pivot (already-sorted input with a first-element pivot).
- **Counting / radix sort** - O(n + k) when keys are small integers; sorting is not always O(n log n).

**Stability** means equal elements keep their relative order. It is what lets you sort by one key and then by another. JavaScript's `Array.prototype.sort` is stable, and its **comparator** must return negative, zero or positive - `(a, b) => a - b` for ascending numbers. Returning a boolean is a bug that happens to work sometimes.

## Recursion and backtracking
<!-- tags: recursion, base-case, backtracking -->

Recursion solves a problem by solving smaller instances of itself. Write the **base case** first, then the step that shrinks the input. Trust the recursive call - do not try to hold the whole stack in your head.

**Backtracking** is recursion that explores choices: pick one, recurse, then *undo* the pick and try the next. It generates permutations, subsets, solves sudoku and N-queens. Pruning (bail out as soon as a partial solution is invalid) is what makes it practical.

```javascript
function permutations(items, path = [], used = new Set(), out = []) {
  if (path.length === items.length) { out.push([...path]); return out; }
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    used.add(i); path.push(items[i]);
    permutations(items, path, used, out);
    path.pop(); used.delete(i);          // undo - the "back" in backtracking
  }
  return out;
}
```

## Dynamic programming
<!-- tags: dynamic-programming, memoisation, bottom-up, coin-change, map -->

When a recursive solution recomputes the same subproblems, **dynamic programming** stores each answer once. Two styles:

- **Top-down (memoisation)**: the recursive function, plus a map from arguments to results. Easiest to derive - write the recursion, then cache it.
- **Bottom-up (tabulation)**: fill a table from the smallest subproblems upward, no recursion, often less memory.

Coin change - fewest coins to make `amount`:

```javascript
function coinChange(coins, amount) {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;                                    // zero coins make zero
  for (let a = 1; a <= amount; a++)
    for (const c of coins)
      if (c <= a) dp[a] = Math.min(dp[a], dp[a - c] + 1);
  return dp[amount] === Infinity ? -1 : dp[amount];
}
```

The recipe: define the state (`dp[a]` = best for amount `a`), the recurrence (one more coin than some smaller amount), the base case, and the order that guarantees smaller states are ready first. Fibonacci, climbing stairs, longest common subsequence and knapsack are the same recipe with different states.

## Greedy algorithms
<!-- tags: greedy, optimality -->

A greedy algorithm makes the locally best choice at each step and never revisits it. It is fast and simple - and only correct when the problem has the **greedy-choice property**: a local optimum is part of some global optimum. Interval scheduling (always pick the meeting that ends earliest) is greedy and correct. Coin change with arbitrary denominations is *not* - greedy picks 25+1+1+1+1 for 29 with coins {25, 10, 4}, but 25+4 is better - which is why that problem needs DP.

When a greedy idea seems to work, look for a counterexample before trusting it; when you cannot find one, try to argue why an optimal solution can be transformed into the greedy one without getting worse.

## Graph search: BFS and DFS
<!-- tags: bfs, dfs, graphs, queue -->

**BFS** uses a queue and visits nodes in order of distance from the start, so the first time it reaches a node is along a shortest path in an unweighted graph. Use it for shortest paths, levels, "minimum moves".

**DFS** uses a stack (or recursion) and goes as deep as possible first. Use it for connectivity, cycle detection, topological ordering, and problems where you need to explore complete paths.

Both are O(V + E) with a visited set. Grids are graphs too: each cell has up to four neighbours, and "number of islands" is DFS from every unvisited land cell.

## Solving a new problem
<!-- tags: debugging, pseudocode -->

1. Restate the problem with a tiny example and the expected output.
2. Name the brute force and its complexity - that is your baseline.
3. Ask which pattern the constraints point to: contiguous → sliding window; sorted → two pointers or binary search; "min/max ways" → DP; "shortest" → BFS; "in place" → reader/writer pointers.
4. Write the invariant down before the loop. Most bugs are the invariant silently breaking at a boundary.
5. Test the empty input, one element, all equal, and already-sorted cases before anything else.
