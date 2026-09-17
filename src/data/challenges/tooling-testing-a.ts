import { Challenge } from '../../types';

/**
 * Stage 08 - Git, Tooling & Testing, batch A.
 * The add/commit/push model, branching, merge vs rebase, conflicts,
 * reset vs revert vs restore, stash, .gitignore and unified diffs.
 */
export const challenges: Challenge[] = [
  {
    id: 'stage-8-a01',
    stageId: 'stage-8',
    title: 'Where a change lives',
    type: 'quiz',
    difficulty: 'easy',
    language: 'bash',
    prompt:
      'After the commit below, and before any further command, where does the new version of app.js exist?',
    codeSnippet:
      '$ echo "log(x);" >> app.js\n' +
      '$ git status --short\n' +
      ' M app.js\n' +
      '$ git add app.js\n' +
      '$ git status --short\n' +
      'M  app.js\n' +
      '$ git commit -m "add logging"\n' +
      '[main 3f9a1c2] add logging',
    options: [
      'In the working tree, the index and the local repository, but not on origin',
      'In the working tree only; commit just marks the file for the next push',
      'In the local repository and on origin, because committing contacts the remote',
      'In the index only; committing clears the working tree copy'
    ],
    correctIndex: 0,
    hints: [
      'Name every place git keeps a copy of app.js, then ask which of them git commit writes to.',
      'Which of the commands shown here contacts the network?'
    ],
    explanation:
      'A change moves through three places on your own machine: the working tree you edit, the index that git add snapshots, and the local repository that git commit writes a commit into. Only git push copies those commits to origin, so a commit on its own is still invisible to everyone else.',
    xpReward: 40,
    tags: ['git', 'staging', 'commit', 'mental-model']
  },
  {
    id: 'stage-8-a02',
    stageId: 'stage-8',
    title: 'What git add actually captured',
    type: 'output_prediction',
    difficulty: 'medium',
    language: 'bash',
    prompt: 'What does the final command print?',
    codeSnippet:
      "$ printf 'one\\n' > notes.txt\n" +
      '$ git add notes.txt\n' +
      "$ printf 'two\\n' >> notes.txt\n" +
      '$ git commit -q -m "add notes"\n' +
      '$ git show HEAD:notes.txt',
    options: [
      'one',
      'one and two, on two lines',
      'two',
      'nothing, because git refuses to commit a file that changed after it was staged'
    ],
    correctIndex: 0,
    hints: [
      'git add is a snapshot taken at the moment it runs, not a subscription to the file.',
      'git commit records the index. Which content is in the index here?'
    ],
    explanation:
      'git add copies the content of the file into the index at the moment it runs, so the index holds only "one". git commit records the index rather than the working tree, so HEAD:notes.txt is "one" and git status still reports notes.txt as modified. Staging early and editing afterwards is the usual way work silently misses a commit.',
    xpReward: 70,
    tags: ['git', 'staging', 'index', 'commit']
  },
  {
    id: 'stage-8-a03',
    stageId: 'stage-8',
    title: 'Start and publish a branch',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'bash',
    prompt: 'Fill in the blanks so the branch is created, published with a tracking branch, and left behind.',
    codeSnippet:
      '# create feature/login at the current commit and move onto it\n' +
      '$ git switch ___ feature/login\n' +
      '# ... commit some work ...\n' +
      '# publish it and remember the upstream in one step\n' +
      '$ git push ___ origin feature/login\n' +
      '# go back to the integration branch\n' +
      '$ git ___ main',
    blanks: [
      { answer: '-c', alternatives: ['--create'], choices: ['-c', '-b', '-m', '--new'] },
      { answer: '-u', alternatives: ['--set-upstream'], choices: ['-u', '-t', '--track', '-f'] },
      { answer: 'switch', choices: ['switch', 'branch', 'merge', 'reset'] }
    ],
    hints: [
      'git switch spells "create" differently from the older git checkout -b.',
      'The flag that sets an upstream lets later git push and git pull run with no arguments.'
    ],
    explanation:
      'git switch -c creates a branch and moves HEAD onto it, the modern spelling of git checkout -b. Pushing with -u records origin/feature/login as the upstream, so later pushes and pulls need no arguments. git branch main would move you nowhere - branch only creates or lists branches, and here it would simply fail because main already exists.',
    xpReward: 40,
    tags: ['git', 'branching', 'remotes']
  },
  {
    id: 'stage-8-a04',
    stageId: 'stage-8',
    title: 'Merge or rebase',
    type: 'quiz',
    difficulty: 'medium',
    language: 'bash',
    prompt:
      'You are on feature and run git rebase main. Which statement describes the result?',
    codeSnippet:
      '# feature branched off main at C2; both sides have moved on\n' +
      '$ git log --oneline --graph --all\n' +
      '* 9f1c2ab (main) C4\n' +
      '* 7ba0d31 C3\n' +
      '| * 4de55a0 (HEAD -> feature) F2\n' +
      '| * 1c0b7e9 F1\n' +
      '|/\n' +
      '* 22aa10c C2\n' +
      '* 0f3e771 C1',
    options: [
      'F1 and F2 are replayed on top of C4 as new commits with new hashes, so feature becomes linear',
      'A new commit with two parents, C4 and F2, is added to feature, and F1 and F2 keep their hashes',
      'main is fast-forwarded onto F2, so main and feature end up pointing at the same commit',
      'F1 and F2 keep their original hashes and simply gain C4 as an extra second parent'
    ],
    correctIndex: 0,
    hints: [
      'Rebase means "give these commits a new base". What has to change about a commit when its parent changes?',
      'Only one of these two operations ever creates a commit with two parents.'
    ],
    explanation:
      'Rebase re-applies each of your commits on top of the new base, so the changes survive but every replayed commit gets a new parent and therefore a new hash, and the history stays linear. Merge is the other option: it leaves the original commits alone and adds one commit with two parents. Because rebase rewrites commits, avoid it on a branch other people have already pulled.',
    xpReward: 70,
    tags: ['git', 'rebase', 'merge', 'history']
  },
  {
    id: 'stage-8-a05',
    stageId: 'stage-8',
    title: 'Work through a merge conflict',
    type: 'pseudocode_order',
    difficulty: 'medium',
    language: 'pseudocode',
    prompt: 'Order the steps that take a conflicted merge through to a finished merge commit.',
    pseudocodeLines: [
      'RUN git merge feature AND see it stop with a CONFLICT message',
      'RUN git status TO list the paths it now marks as both modified',
      'OPEN the first path from that list AND find the <<<<<<< ======= >>>>>>> markers',
      'EDIT that region into the final content AND delete the three marker lines',
      'RUN git add on that same file TO mark its conflict resolved',
      'REPEAT from the status listing until no unmerged paths are left',
      'RUN git commit TO record the merge commit'
    ],
    hints: [
      'Git cannot tell which side is right, so the decision happens in the editor before anything else.',
      'Staging a file is how you tell git that its conflict is settled.'
    ],
    explanation:
      'A conflict pauses the merge and writes both versions into the file between markers, because git has no way to know which side is correct. Adding the file is what marks it resolved, and the final commit is the merge commit that records both parents. git merge --abort throws the whole attempt away if you would rather start over.',
    xpReward: 70,
    tags: ['git', 'merge-conflict', 'workflow']
  },
  {
    id: 'stage-8-a06',
    stageId: 'stage-8',
    title: 'Undo with revert, reset or restore',
    type: 'multi_select',
    difficulty: 'medium',
    language: 'bash',
    prompt:
      'C3 was a mistake. Which statements about these four ways of dealing with it are true? Select every one that applies.',
    codeSnippet:
      '$ git log --oneline\n' +
      '9f1c2ab (HEAD -> main) C3\n' +
      '7ba0d31 C2\n' +
      '22aa10c C1\n' +
      '# four different ways to deal with C3:\n' +
      '#   A   git revert 9f1c2ab\n' +
      '#   B   git reset --soft 7ba0d31\n' +
      '#   C   git reset --hard 7ba0d31\n' +
      '#   D   git restore --source=7ba0d31 app.js',
    options: [
      'A appends a new commit whose diff is the inverse of C3, and C3 stays in the log',
      'B moves main back to C2 while leaving the changes from C3 staged in the index',
      'C moves main back to C2 and overwrites the working tree, so uncommitted edits to tracked files are lost',
      'D moves the branch pointer back to C2 as well',
      'A deletes commit 9f1c2ab, so git log no longer shows it',
      'C is the safe choice once C3 has been pushed and pulled by teammates'
    ],
    correctIndices: [0, 1, 2],
    hints: [
      'Ask of each command: does it move the branch pointer, touch the index, or only rewrite files?',
      'Exactly one of these adds history instead of rewriting it.'
    ],
    explanation:
      'reset moves the branch pointer, and the mode decides how much comes with it: --soft leaves the old changes staged, --hard overwrites index and working tree. revert never rewrites history, it appends an inverse commit, which is why it is the only safe undo for commits other people already have. restore of a path rewrites files in the working tree and moves no pointer at all.',
    xpReward: 70,
    tags: ['git', 'reset', 'revert', 'restore']
  },
  {
    id: 'stage-8-a07',
    stageId: 'stage-8',
    title: 'Park work with stash',
    type: 'pseudocode_order',
    difficulty: 'easy',
    language: 'pseudocode',
    prompt:
      'You are half way through a change on feature when an urgent bug on main has to be fixed. Order the steps.',
    pseudocodeLines: [
      'RUN git stash push TO park the half-finished changes and leave a clean tree',
      'RUN git switch main, which only succeeds now that nothing is left dangling',
      'RUN git pull TO update main before building the fix on top of it',
      'FIX the urgent bug AND commit it on main',
      'RUN git switch feature TO come back to the parked work',
      'RUN git stash pop TO reapply the parked changes and drop the stash entry'
    ],
    hints: [
      'Git only lets you move between branches cleanly when nothing is left dangling in the working tree.',
      'pop and apply differ in one thing: what happens to the saved entry afterwards.'
    ],
    explanation:
      'git stash takes the modified tracked files out of the working tree and stores them as hidden commits, leaving a clean tree so you can switch branches safely. pop reapplies the changes and deletes the entry, while apply reapplies them but keeps it. Untracked files are left where they are unless you pass -u.',
    xpReward: 40,
    tags: ['git', 'stash', 'workflow']
  },
  {
    id: 'stage-8-a08',
    stageId: 'stage-8',
    title: 'Anchor and untrack in .gitignore',
    type: 'fill_blank',
    difficulty: 'easy',
    language: 'bash',
    prompt: 'Fill in the two pattern characters and the flag that stops tracking an already committed file.',
    codeSnippet:
      '# .gitignore\n' +
      '___dist/       # only the dist directory at the repo root, not src/dist\n' +
      '*.log\n' +
      '___keep.log    # but track this one file anyway\n' +
      '\n' +
      '# app.log was committed before the rule existed, so git still tracks it\n' +
      '$ git rm ___ app.log',
    blanks: [
      { answer: '/', choices: ['/', '*', '**', './'] },
      { answer: '!', choices: ['!', '#', '-', '^'] },
      { answer: '--cached', choices: ['--cached', '--force', '--ignored', '-r'] }
    ],
    hints: [
      'Without an anchor, a pattern matches at every depth in the tree.',
      'The rule file only ever decides what happens to files git is not already tracking.'
    ],
    explanation:
      'A leading slash anchors a pattern to the directory holding the .gitignore, so /dist/ ignores only the top-level one. A leading ! re-includes a file that an earlier pattern excluded. Ignore rules apply only to untracked files, so a file already in the index keeps being tracked until git rm --cached removes it from the index while leaving it on disk.',
    xpReward: 40,
    tags: ['git', 'gitignore', 'tracking']
  },
  {
    id: 'stage-8-a09',
    stageId: 'stage-8',
    title: 'Parse a diff hunk header',
    type: 'code_runner',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'A unified diff hunk header looks like "@@ -12,7 +12,8 @@ context". Return { oldStart, oldLines, newStart, newLines } as numbers. A missing count means exactly 1. Return null for any line that is not a hunk header.',
    starterCode:
      'function parseHunk(header) {\n' +
      '  // "@@ -12,7 +12,8 @@" means: 7 lines from old line 12\n' +
      '  // became 8 lines from new line 12.\n' +
      '  // "@@ -1 +1 @@" means one line on each side.\n' +
      '  return null;\n' +
      '}',
    entryFunction: 'parseHunk',
    testCases: [
      {
        input: '"@@ -12,7 +12,8 @@ function total() {"',
        expected: '{"oldStart": 12, "oldLines": 7, "newStart": 12, "newLines": 8}'
      },
      {
        input: '"@@ -1 +1 @@"',
        expected: '{"oldStart": 1, "oldLines": 1, "newStart": 1, "newLines": 1}'
      },
      {
        input: '"@@ -0,0 +1,5 @@"',
        expected: '{"oldStart": 0, "oldLines": 0, "newStart": 1, "newLines": 5}'
      },
      {
        input: '"@@ -34,6 +33,0 @@"',
        expected: '{"oldStart": 34, "oldLines": 6, "newStart": 33, "newLines": 0}'
      },
      { input: '"--- a/app.js"', expected: 'null' }
    ],
    solutionCode:
      'function parseHunk(header) {\n' +
      '  const m = /^@@ -(\\d+)(?:,(\\d+))? \\+(\\d+)(?:,(\\d+))? @@/.exec(header);\n' +
      '  if (!m) return null;\n' +
      '  const count = (v) => (v === undefined ? 1 : Number(v));\n' +
      '  return {\n' +
      '    oldStart: Number(m[1]),\n' +
      '    oldLines: count(m[2]),\n' +
      '    newStart: Number(m[3]),\n' +
      '    newLines: count(m[4])\n' +
      '  };\n' +
      '}',
    hints: [
      'Both counts are optional, so the comma and the number after it belong in an optional group.',
      'A count of 0 is not the same as a missing count: 0 means the side is empty, missing means 1.'
    ],
    explanation:
      'The header records where a hunk starts and how many lines it spans on each side, which is exactly what a patch tool needs to place the change in the target file. The count is omitted when it is 1, so treating a missing group as 1 rather than 0 is the part that is easy to get wrong, while an explicit 0 means the hunk only adds or only deletes.',
    xpReward: 110,
    tags: ['git', 'unified-diff', 'parsing', 'regex']
  },
  {
    id: 'stage-8-a10',
    stageId: 'stage-8',
    title: 'The diff stat that counts too much',
    type: 'debug',
    difficulty: 'hard',
    language: 'javascript',
    prompt:
      'diffStat should count the added and removed lines of a unified diff, but it reports one extra of each. Find the bug and fix it.',
    starterCode:
      'function diffStat(diff) {\n' +
      '  let added = 0;\n' +
      '  let removed = 0;\n' +
      '  for (const line of diff.split("\\n")) {\n' +
      '    if (line.startsWith("+")) added++;\n' +
      '    else if (line.startsWith("-")) removed++;\n' +
      '  }\n' +
      '  return { added: added, removed: removed };\n' +
      '}',
    entryFunction: 'diffStat',
    testCases: [
      {
        input:
          '"--- a/app.js\\n+++ b/app.js\\n@@ -1,3 +1,4 @@\\n const a = 1;\\n-const b = 2;\\n+const b = 3;\\n+const c = 4;\\n module.exports = a;"',
        expected: '{"added": 2, "removed": 1}'
      },
      {
        input: '"--- /dev/null\\n+++ b/README.md\\n@@ -0,0 +1,2 @@\\n+# Title\\n+some text"',
        expected: '{"added": 2, "removed": 0}'
      },
      {
        input:
          '"--- a/old.js\\n+++ b/old.js\\n@@ -1,4 +1,2 @@\\n keep\\n-drop one\\n-drop two\\n keep"',
        expected: '{"added": 0, "removed": 2}'
      },
      {
        input:
          '"--- a/schema.sql\\n+++ b/schema.sql\\n@@ -1,2 +1,2 @@\\n -- users table\\n-CREATE TABLE user (id INT);\\n+CREATE TABLE users (id INT);"',
        expected: '{"added": 1, "removed": 1}'
      },
      {
        input: '"--- a/a.txt\\n+++ b/a.txt\\n@@ -1,1 +1,1 @@\\n-a\\n+A\\n@@ -10,1 +10,2 @@\\n x\\n+y"',
        expected: '{"added": 2, "removed": 1}'
      }
    ],
    solutionCode:
      'function diffStat(diff) {\n' +
      '  let added = 0;\n' +
      '  let removed = 0;\n' +
      '  for (const line of diff.split("\\n")) {\n' +
      '    if (line.startsWith("+++") || line.startsWith("---")) continue;\n' +
      '    if (line.startsWith("+")) added++;\n' +
      '    else if (line.startsWith("-")) removed++;\n' +
      '  }\n' +
      '  return { added: added, removed: removed };\n' +
      '}',
    hints: [
      'Log every line the counter accepts, then ask which of them a reviewer would call a change.',
      'The hunk header already states the real totals. Your count is bigger, so something outside the hunk body is being counted.'
    ],
    explanation:
      'The two file headers, --- a/path and +++ b/path, start with the same characters as removed and added content lines, so a naive prefix test counts each of them once. Skipping the three-character prefixes first fixes it; context lines are safe already because they begin with a space, which is why " -- users table" is not counted as a deletion.',
    xpReward: 110,
    tags: ['git', 'unified-diff', 'debugging', 'string-parsing']
  }
];
