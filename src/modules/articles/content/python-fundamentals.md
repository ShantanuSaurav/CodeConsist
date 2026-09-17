# Python Fundamentals: lists, dicts and idioms
<!-- stage: stage-2 -->

> Python's power is in a handful of built-in types used well. This article covers the containers, slicing, mutability, comprehensions and the small idioms that Stage 02's lessons and test depend on.

## Lists, indexing and slicing
<!-- tags: lists, indexing, slicing, negative-index -->

A list is an ordered, mutable sequence. Indexing starts at 0; **negative indexes count from the end**, so `xs[-1]` is the last element.

```python
xs = [10, 20, 30, 40, 50]
xs[0]      # 10
xs[-1]     # 50
xs[1:3]    # [20, 30]   - start inclusive, stop exclusive
xs[:2]     # [10, 20]
xs[3:]     # [40, 50]
xs[::2]    # [10, 30, 50] - every second element
xs[::-1]   # [50, 40, 30, 20, 10] - reversed copy
```

Slicing never raises for out-of-range bounds - `xs[3:100]` just gives `[40, 50]` - while indexing does (`xs[10]` is an `IndexError`). A slice is always a **new list**, which makes `xs[:]` a cheap way to copy.

## Strings and formatting
<!-- tags: strings, f-strings, formatting, split, strip, methods -->

Strings are immutable sequences, so slicing and negative indexes work exactly as on lists. Methods return new strings.

```python
s = "  Hello, World  "
s.strip()               # "Hello, World"
s.strip().lower()       # "hello, world"
"a,b,,c".split(",")     # ['a', 'b', '', 'c']
"a  b   c".split()      # ['a', 'b', 'c'] - no argument: any whitespace, empties dropped
", ".join(["x", "y"])   # "x, y"
"abc".upper()[::-1]     # "CBA"
```

**f-strings** are the modern way to format: put expressions in braces, with an optional format spec after a colon.

```python
name, score = "Ada", 0.8765
print(f"{name}: {score:.1%}")      # Ada: 87.7%
print(f"{42:05d} | {3.14159:.2f}")  # 00042 | 3.14
print(f"{name!r}")                  # 'Ada' - repr
```

## Tuples, mutability and identity
<!-- tags: tuples, mutability, immutability, identity, equality, references -->

A tuple is an immutable list: `(1, 2)`. You cannot append to it or assign an element - but if it *contains* a list, that list is still mutable.

The key idea is that variables are **references**. Assigning a list to a second name does not copy it.

```python
a = [1, 2, 3]
b = a          # same object
b.append(4)
print(a)       # [1, 2, 3, 4]
c = a[:]       # a copy; c is a == True, c is a == False
```

`==` compares values; `is` compares identity (same object). Use `is` only for `None`, `True` and `False`. Function arguments are passed by reference too: a function that does `items.append(x)` changes the caller's list, while `items = items + [x]` rebinds a local name and leaves the caller's list alone.

The default-argument trap follows directly: `def f(items=[])` creates the list **once**, at definition time, and every call without an argument shares it. Use `items=None` and create the list inside.

## Dicts, sets and hashing
<!-- tags: dicts, hashing, get, defaults, sets, counting -->

A dict maps **hashable** keys to values in O(1) average time. Strings, numbers and tuples are hashable; lists and dicts are not, because they can change.

```python
counts = {}
for word in "the cat the dog".split():
    counts[word] = counts.get(word, 0) + 1     # .get avoids a KeyError
# {'the': 2, 'cat': 1, 'dog': 1}

counts["bird"]            # KeyError
counts.get("bird")        # None
counts.get("bird", 0)     # 0
"cat" in counts           # True - membership checks keys
list(counts.items())      # [('the', 2), ('cat', 1), ('dog', 1)] - insertion order is kept
```

`collections.Counter` and `defaultdict` are dicts with the counting boilerplate built in. A **set** is a dict with only keys: unordered, no duplicates, O(1) membership. `set(xs)` deduplicates; `a & b`, `a | b`, `a - b` are intersection, union and difference.

## Truthiness, conditionals and operators
<!-- tags: truthiness, conditionals, operators, arithmetic, floor-division, modulo -->

Falsy values: `False`, `None`, `0`, `0.0`, `""`, `[]`, `{}`, `()`, `set()`. Everything else is truthy, so `if items:` is the idiomatic "is it non-empty".

Python has three arithmetic operators people mix up:

```python
7 / 2      # 3.5   - true division, always a float
7 // 2     # 3     - floor division
-7 // 2    # -4    - floors toward negative infinity, not toward zero
-7 % 2     # 1     - remainder takes the sign of the divisor
2 ** 10    # 1024
```

`and` and `or` return one of their operands, not a boolean: `x or "default"` gives `"default"` when `x` is falsy. Comparisons chain: `0 < n < 10` means what it says.

## Loops, enumerate, zip and unpacking
<!-- tags: enumerate, zip, unpacking, sequencing, iterables -->

You rarely need an index loop in Python. Iterate directly, and reach for `enumerate` when you want the index too.

```python
for i, name in enumerate(["a", "b"], start=1):
    print(i, name)              # 1 a / 2 b

for x, y in zip([1, 2, 3], [4, 5, 6]):
    print(x + y)                # 5 7 9 - stops at the shorter iterable

first, *middle, last = [1, 2, 3, 4, 5]   # 1, [2, 3, 4], 5
a, b = b, a                              # swap without a temp
```

A `for` loop can have an `else` clause that runs only if the loop was **not** broken out of - handy for "search and report not found".

## Comprehensions and filtering
<!-- tags: comprehensions, filtering -->

A comprehension builds a list, set or dict from an iterable in one expression: `[expression for item in iterable if condition]`.

```python
squares = [n * n for n in range(6)]                  # [0, 1, 4, 9, 16, 25]
evens   = [n for n in range(10) if n % 2 == 0]
lengths = {word: len(word) for word in ["hi", "hello"]}
unique  = {c.lower() for c in "Hello"}                # {'h', 'e', 'l', 'o'}
```

The `if` filters *before* the expression runs. Nested `for` clauses read left to right like nested loops. Keep comprehensions to one line of intent; when you need a comment inside, use a loop.

## Sorting and key functions
<!-- tags: sorting, key-function, built-ins -->

`sorted(xs)` returns a new list; `xs.sort()` sorts in place and returns `None` - assigning its result is a classic bug. Both accept `key=` (a function that produces the value to compare) and `reverse=`.

```python
words = ["banana", "Apple", "cherry"]
sorted(words)                       # ['Apple', 'banana', 'cherry'] - uppercase first
sorted(words, key=str.lower)        # ['Apple', 'banana', 'cherry']
sorted(words, key=len, reverse=True)
pairs = [("b", 2), ("a", 2), ("c", 1)]
sorted(pairs, key=lambda p: (p[1], p[0]))   # sort by count, then name
```

Python's sort is **stable**: elements that compare equal keep their original order, so sorting twice by different keys composes predictably. `min`, `max` and `heapq.nsmallest` take the same `key=`.

## Exceptions
<!-- tags: exceptions, try-except, error-handling -->

Python prefers *asking forgiveness*: try the operation and handle the specific exception, rather than pre-checking everything.

```python
def to_int(text, default=0):
    try:
        return int(text)
    except ValueError:
        return default
    finally:
        pass  # cleanup runs either way
```

Catch the narrowest exception that makes sense. A bare `except:` also swallows `KeyboardInterrupt` and hides real bugs. `raise` with no argument re-raises the current exception; `raise ValueError("...") from err` keeps the cause chained.

## Generators and lazy evaluation
<!-- tags: generators, lazy-evaluation -->

A function with `yield` returns a **generator**: an iterator that produces one value at a time, on demand, and remembers where it was.

```python
def countdown(n):
    while n > 0:
        yield n
        n -= 1

g = countdown(3)
next(g)          # 3
list(g)          # [2, 1] - the 3 was already consumed
```

Generators are lazy, so they can represent infinite sequences and pipelines that never hold everything in memory. A generator expression `(n * n for n in range(10**9))` costs nothing until iterated. Once exhausted, a generator is done - iterate it twice and the second pass is empty.

## Intervals: a worked pattern
<!-- tags: intervals, python -->

Stage 02's test asks you to merge overlapping intervals. The pattern: sort by start, then sweep, extending the current interval while the next one overlaps.

```python
def merge(intervals):
    out = []
    for start, end in sorted(intervals):
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)   # overlap: extend
        else:
            out.append([start, end])             # gap: start a new one
    return out
```

Notice the ingredients from this article: sorting with the default tuple order, negative indexing, tuple unpacking in the loop header, and mutating the list you are building.
