# Git, Tooling & Testing: the craft around the code
<!-- stage: stage-8 -->

> Working code is half the job; the other half is keeping it working while several people change it. This article covers Git's mental model and daily commands, testing at each level, test doubles, package management, versioning and continuous integration.

## Git's mental model
<!-- tags: git, mental-model, index, staging, commit, tracking -->

Git tracks **snapshots**, not diffs. A commit points to a complete tree of files plus its parent commit(s); branches are just movable labels pointing at commits, and `HEAD` is the label you are on.

There are three places a change can be:

1. The **working tree** - your files on disk.
2. The **index** (staging area) - what the next commit will contain. `git add` copies a change here.
3. The **repository** - commits. `git commit` turns the index into a commit.

```bash
git status                 # what is where
git add -p                 # stage hunk by hunk
git commit -m "..."        # index -> commit
git diff                   # working tree vs index
git diff --staged          # index vs HEAD
git log --oneline --graph  # the shape of history
```

A file is **untracked** until its first `git add`; `.gitignore` patterns keep build output, secrets and dependencies out of that list for good. Ignoring a file that is already tracked does nothing until you `git rm --cached` it.

## Branching, merging and rebasing
<!-- tags: branching, merge, rebase, history, merge-conflict, remotes, workflow -->

A branch is cheap: `git switch -c feature` creates one at the current commit. Integrating it back has two flavours:

- **Merge** creates a commit with two parents. History is truthful and non-linear.
- **Rebase** replays your commits on top of the target, rewriting them. History is linear and tidy - but the commits get new ids, so **never rebase commits others already have**.

A **conflict** happens when both sides changed the same lines. Git marks the region; you edit the file to what it should be, remove the markers, `git add` it and continue.

```
<<<<<<< HEAD
const limit = 20;
=======
const limit = 50;
>>>>>>> feature
```

**Remotes** are other copies of the repository. `git fetch` downloads their commits without touching your branches; `git pull` is fetch plus merge (or rebase, with `--rebase`). `git push` uploads a branch; a rejected push means someone else pushed first - fetch, integrate, push again. Never `push --force` to a shared branch; `--force-with-lease` at least refuses if someone pushed meanwhile.

## Undoing things safely
<!-- tags: reset, revert, restore, stash -->

- `git restore file` - discard working-tree changes to a file. `git restore --staged file` - unstage it.
- `git stash` - shelve everything uncommitted; `git stash pop` brings it back.
- `git revert <commit>` - a **new** commit that undoes an old one. Safe on shared history.
- `git reset --soft HEAD~1` - undo the last commit, keep changes staged. `--mixed` keeps them unstaged. `--hard` throws them away - the only one of these that destroys work.
- `git reflog` - where `HEAD` has been. Almost anything "lost" in the last weeks is still reachable from here.

Rule of thumb: on your own branch, `reset` and rebase freely; on anything shared, `revert`.

## Reading diffs
<!-- tags: unified-diff, parsing, string-parsing, regex -->

A **unified diff** describes a change as hunks. The header `@@ -12,5 +12,6 @@` means "old file lines 12-16, new file lines 12-17". Lines starting with `-` were removed, `+` added, and a space prefix means unchanged context.

```
--- a/config.js
+++ b/config.js
@@ -1,3 +1,3 @@
 const port = 4000;
-const debug = true;
+const debug = false;
 export { port, debug };
```

Tools that parse diffs count lines per prefix; a regular expression like `/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/` pulls out the hunk ranges. Review diffs, not files - and keep commits small enough that their diff tells one story.

## Testing: levels and structure
<!-- tags: testing, test-levels, unit-tests, arrange-act-assert, test-structure, tdd -->

- **Unit tests** exercise one function or class in isolation. Fast, many, precise about *what* broke.
- **Integration tests** exercise several pieces together - a route handler with a real database. Slower, fewer, catch wiring mistakes.
- **End-to-end tests** drive the whole system like a user. Slowest, fewest, catch what the others cannot.

Each test reads as **Arrange, Act, Assert**: set up the inputs, do the one thing, check the outcome. One behaviour per test, named after the behaviour.

```javascript
test("compress collapses runs of the same character", () => {
  const input = "aaabcc";               // arrange
  const result = compress(input);       // act
  expect(result).toBe("a3b1c2");        // assert
});
```

**TDD** writes the failing test first, then the minimum code to pass, then refactors. Even without strict TDD, writing the test *before* the fix for a bug guarantees the test actually catches it.

## Test doubles and determinism
<!-- tags: test-doubles, mocking, spies, flaky-tests, determinism -->

A **test double** stands in for a dependency. A *stub* returns canned answers; a *spy* records how it was called; a *mock* is a spy with expectations; a *fake* is a working lightweight implementation (an in-memory repository). Mock the boundary - network, clock, filesystem, randomness - not your own logic; tests that mock everything pass while the real thing is broken.

**Flaky tests** pass or fail without a code change. The usual causes are real time (`Date.now()`, `setTimeout`), real randomness, shared state between tests, and order dependence. Inject the clock and the random source so tests can control them, reset state in `beforeEach`, and never let a test depend on another running first.

## Packages, lockfiles and reproducibility
<!-- tags: npm, lockfiles, reproducibility, tooling -->

`package.json` declares dependencies with **ranges** (`^4.2.0` means ≥4.2.0 and <5.0.0). The **lockfile** (`package-lock.json`) records the exact versions that were actually installed, all the way down the tree. Commit it: it is what makes `npm ci` on a colleague's machine or in CI produce the same `node_modules` as yours.

`npm install` may update the lockfile; `npm ci` installs exactly what it says and fails if the two disagree. `dependencies` ship to production; `devDependencies` are for building and testing. Audit and update on a schedule rather than never - and read changelogs for anything with a major bump.

## Semantic versioning
<!-- tags: semver, versioning, comparison -->

`MAJOR.MINOR.PATCH`: bump **patch** for a bug fix, **minor** for a backwards-compatible feature, **major** for a breaking change. Pre-release tags (`2.0.0-beta.1`) sort *before* the release. Comparing versions means comparing each numeric segment as a number, not as a string - `"1.10.0"` is newer than `"1.9.0"`, but a string comparison says otherwise. Stage 08's test asks you to write that comparison.

## Linting, formatting and CI
<!-- tags: linting, formatting, ci, pipelines, automation -->

A **formatter** (Prettier, Black) settles style arguments by making them impossible. A **linter** (ESLint, Ruff) finds likely bugs: unused variables, missing `await`, accidental `==`. Run both on save and in CI.

**Continuous integration** runs the checks on every push: install with the lockfile, lint, type-check, test, build. A pipeline is a script; the value is that it runs the same way every time, on a clean machine, and blocks a merge when something fails.

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run check
      - run: npm run build
```

Keep it fast - under ten minutes - or people stop waiting for it. Fail fast: lint before the slow test suite.

## Debugging with Git
<!-- tags: debugging, falsy -->

`git blame` shows who last touched each line - and, more usefully, *which commit*, so `git show` gives you the why. `git bisect` binary-searches history for the commit that introduced a bug: mark one good and one bad commit, test each one it checks out, and it finds the culprit in log₂(n) steps. `git log -S "someString"` finds commits that added or removed a string.
