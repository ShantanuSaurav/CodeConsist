# Programming Basics: the mental model

> Variables, types, operators and control flow are the same in every language; the details differ. This article uses JavaScript, because that is what Stage 01's lessons run, and calls out the traps the lessons test.

## Variables, scope and hoisting
<!-- tags: var, let, hoisting, scope, undefined -->

A variable is a **name bound to a value**. In modern JavaScript you declare one with `let` (rebindable) or `const` (not rebindable). Both are *block-scoped*: they exist only inside the nearest pair of braces.

```javascript
if (true) {
  let inside = 1;
}
console.log(typeof inside); // "undefined" - the name does not exist out here
```

The older `var` behaves differently in two ways that still show up in interviews and legacy code:

- It is *function-scoped*, so a `var` declared inside an `if` leaks out of it.
- It is **hoisted**: the declaration is moved to the top of the function, but the assignment is not. Reading a `var` before its line gives `undefined` rather than an error.

```javascript
console.log(typeof score); // "undefined"
var score = 100;
console.log(typeof score); // "number"
```

`let` and `const` are also hoisted, but they sit in a *temporal dead zone* until their line runs - touching them early throws a `ReferenceError`. Prefer `const` by default and `let` when you really reassign; you will rarely want `var`.

## Types, typeof and coercion
<!-- tags: typeof, coercion, type-conversion, equality, truthiness, operators -->

JavaScript has seven primitive types (`string`, `number`, `bigint`, `boolean`, `undefined`, `symbol`, `null`) plus objects. `typeof` reports them - with one famous wart: `typeof null` is `"object"`.

**Coercion** is the automatic conversion of one type to another. The `+` operator is the usual culprit: if either side is a string, it concatenates.

```javascript
"3" + 4      // "34"   - string wins
"3" - 4      // -1     - minus only works on numbers, so "3" becomes 3
"3" * "4"    // 12
true + 1     // 2      - true becomes 1
[] + {}      // "[object Object]"
```

`==` coerces before comparing; `===` does not. `0 == ""` is `true`, `0 === ""` is `false`. Use `===` unless you have a specific reason not to.

**Truthiness** is coercion to boolean. Exactly these values are *falsy*: `false`, `0`, `-0`, `0n`, `""`, `null`, `undefined`, `NaN`. Everything else - including `"0"`, `"false"`, `[]` and `{}` - is truthy.

```javascript
if ([]) console.log("an empty array is truthy");   // prints
if ("0") console.log("a non-empty string is truthy"); // prints
```

## Arithmetic, modulo and precedence
<!-- tags: arithmetic, modulo, precedence, expressions -->

Arithmetic follows the usual precedence: `**` before `*` `/` `%`, which come before `+` `-`. Parentheses win. `%` is the **remainder** operator, and its result takes the sign of the left operand: `-7 % 3` is `-1`, not `2`.

```javascript
2 + 3 * 4     // 14
(2 + 3) * 4   // 20
7 % 3         // 1
-7 % 3        // -1
2 ** 3 ** 2   // 512 - exponentiation is right-associative: 2 ** (3 ** 2)
```

Two everyday uses of `%`: testing divisibility (`n % 2 === 0` is even) and wrapping an index around (`(i + 1) % length` goes back to 0 at the end).

Division never truncates in JavaScript - `7 / 2` is `3.5`. To get an integer use `Math.floor`, `Math.trunc` or `Math.round`, and be deliberate about which: `Math.floor(-3.5)` is `-4`, `Math.trunc(-3.5)` is `-3`.

## Conditionals, switch and the ternary
<!-- tags: conditionals, control-flow, switch, ternary, guard-clause -->

`if / else if / else` picks a branch. A **guard clause** is an early `return` at the top of a function that deals with the edge case first, so the main logic does not nest:

```javascript
function average(values) {
  if (values.length === 0) return 0;        // guard: nothing to average
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}
```

The **ternary** `condition ? a : b` is an expression, so it can sit inside a template or an argument. Keep it to one level; nested ternaries are hard to read.

`switch` compares with `===` and **falls through** unless each case ends in `break` or `return`. Forgetting the `break` is a classic bug - two cases run in a row.

```javascript
switch (day) {
  case "sat":
  case "sun":
    kind = "weekend";   // both cases share this on purpose
    break;
  default:
    kind = "weekday";
}
```

## Loops and off-by-one errors
<!-- tags: loops, off-by-one, edge-cases -->

A `for` loop has three parts: initialiser, condition, update. The condition is checked *before* every iteration, including the first.

```javascript
for (let i = 0; i < items.length; i++) { /* i runs 0 .. length-1 */ }
for (const item of items) { /* item is each value */ }
for (const key in object) { /* key is each property name */ }
let n = 0;
while (n < 3) n++;           // runs 3 times
do { n--; } while (n > 0);   // runs at least once
```

**Off-by-one errors** come from the two ways to write a boundary: `<` versus `<=`, and `0` versus `1` as the start. `for (let i = 0; i <= arr.length; i++)` reads one past the end, where `arr[i]` is `undefined`. Ask "how many times does this run?" and check it against the smallest input you can think of - an empty array, a single element.

`break` leaves the loop; `continue` skips to the next iteration. Both are fine when they make the loop simpler.

## Strings and template literals
<!-- tags: strings, template-literals, interpolation, methods -->

Strings are **immutable**: every method returns a new string and leaves the original alone.

```javascript
const s = "Hello";
s.toUpperCase();      // "HELLO" - s is still "Hello"
s.slice(1, 3);        // "el"    - end index is exclusive
s.at(-1);             // "o"
s.split("");          // ["H","e","l","l","o"]
"a,b,,c".split(",");  // ["a","b","","c"] - empty fields are kept
s.includes("ell");    // true
"  x ".trim();        // "x"
```

**Template literals** use backticks and `${}` for interpolation. Any expression works inside the braces, and the string can span lines.

```javascript
const name = "Ada", n = 3;
console.log(`${name} solved ${n} ${n === 1 ? "problem" : "problems"}`);
```

## Functions, parameters and return
<!-- tags: functions, parameters, return, destructuring -->

A function that reaches the end without a `return` statement returns `undefined`. Missing arguments are also `undefined`, which is where **default parameters** help.

```javascript
function greet(name = "friend", { loud = false } = {}) {
  const text = `Hi, ${name}`;
  return loud ? text.toUpperCase() : text;
}
greet();                       // "Hi, friend"
greet("Ada", { loud: true });  // "HI, ADA"
```

The second parameter above uses **destructuring** with a default: it pulls `loud` out of an options object, and the `= {}` means calling with no options does not crash. Destructuring works on arrays too: `const [first, ...rest] = list;`.

Arrow functions `(a, b) => a + b` are shorter and do not have their own `this`. A one-line arrow returns the expression automatically; wrap an object literal in parentheses to return it: `() => ({ ok: true })`.

## Scope and closures
<!-- tags: closures, scope -->

A **closure** is a function that remembers the variables of the scope it was created in, even after that scope has finished running.

```javascript
function counter() {
  let n = 0;                // lives on as long as the returned function does
  return () => ++n;
}
const next = counter();
next(); next(); next();     // 1, 2, 3 - each call sees the same n
const other = counter();    // a fresh n, starting from 0
```

Closures power callbacks, event handlers and modules. The classic trap is a `var` inside a loop: every callback shares one variable, so they all see its final value. `let` creates a fresh binding per iteration, which is what you almost always want.

## Arrays and immutability
<!-- tags: arrays, immutability -->

Arrays are objects, so assigning one to another variable **shares** it - both names point at the same array. Copy with the spread operator or `slice()` when you need independence.

```javascript
const a = [1, 2, 3];
const b = a;          // same array
b.push(4);            // a is now [1, 2, 3, 4] too
const c = [...a];     // a real copy (one level deep)
```

Know which methods mutate: `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse` change the array in place. `map`, `filter`, `slice`, `concat`, `toSorted` return new ones. `sort()` without a comparator sorts *as strings*, so `[10, 9, 1].sort()` gives `[1, 10, 9]`; pass `(a, b) => a - b` for numbers.

## Errors and try/catch
<!-- tags: try-catch, error-handling -->

A thrown error unwinds the call stack until something catches it. `try / catch / finally` is that something; `finally` runs whether or not there was an error, which makes it the right place for cleanup.

```javascript
function parse(json) {
  try {
    return JSON.parse(json);
  } catch (err) {
    console.error("bad input:", err.message);
    return null;
  } finally {
    console.log("done");   // runs on both paths
  }
}
```

Throw `Error` objects, not strings - they carry a stack trace. Catch as close to where you can *handle* the problem as possible; catching everything and doing nothing hides bugs.

## Recursion and the base case
<!-- tags: recursion, base-case -->

A recursive function calls itself on a smaller version of the problem. It needs a **base case** - the input small enough to answer directly - or it recurses forever and blows the stack.

```javascript
function sum(list) {
  if (list.length === 0) return 0;           // base case
  return list[0] + sum(list.slice(1));       // shrink, then recurse
}
```

Read a recursive function by trusting the recursive call: assume `sum(rest)` is correct and check that the current step combines it correctly. Every recursive solution can be rewritten with a loop and an explicit stack; recursion is chosen for clarity, not speed.

## Two pointers
<!-- tags: two-pointers -->

Two indices moving through the same array replace many nested loops. For a palindrome check, one pointer starts at each end and they walk inward:

```javascript
function isPalindrome(s) {
  let lo = 0, hi = s.length - 1;
  while (lo < hi) {
    if (s[lo] !== s[hi]) return false;
    lo++; hi--;
  }
  return true;
}
```

That is O(n) time and O(1) extra space. Stage 04 goes much deeper into this pattern.

## Debugging: reading code like the runtime does
<!-- tags: debugging, pseudocode, sequencing -->

Most bugs in this stage are one of: wrong boundary (`<` vs `<=`), wrong type (a string where a number was expected), a mutated value that was assumed unchanged, or a step in the wrong order.

When a program does something surprising, do not guess - **trace it**. Write down each variable and update the table line by line, exactly as the machine would. Pseudocode is that same discipline in prose: name the steps, put them in order, and check that every value you use has been produced by an earlier step.
