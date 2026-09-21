import type { Roadmap } from '@/types';
import { book, docs, link, practice, roadmapSh } from './helpers';

const GIT = 'https://git-scm.com';
const GH = 'https://docs.github.com/en';

export const roadmap: Roadmap = {
  slug: 'git-github',
  order: 10,
  title: 'Git & GitHub',
  kind: 'skill',
  icon: '🌿',
  description: 'Version control from first commit to team workflows: branching, merging, undoing, code review and automation.',
  roadmapShUrl: 'https://roadmap.sh/git-github',
  sections: [
    {
      id: 'basics',
      title: 'Git basics',
      nodes: [
        {
          id: 'mental-model',
          title: 'How Git thinks',
          description: 'Snapshots not diffs; commits, trees and blobs; branches as pointers; the three areas (working tree, index, repository).',
          stageId: 'stage-8',
          tags: ['git', 'mental-model', 'index', 'staging'],
          resources: [book('Pro Git - Getting Started', `${GIT}/book/en/v2/Getting-Started-What-is-Git%3F`), book('Pro Git - Git Internals', `${GIT}/book/en/v2/Git-Internals-Plumbing-and-Porcelain`)]
        },
        {
          id: 'daily-commands',
          title: 'Daily commands',
          description: 'status, add, commit, diff, log, show. Staging hunks with add -p. Writing commit messages that explain why.',
          stageId: 'stage-8',
          tags: ['commit', 'tracking'],
          resources: [book('Pro Git - Recording changes', `${GIT}/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository`), link('Conventional Commits', 'https://www.conventionalcommits.org/')]
        },
        {
          id: 'gitignore',
          title: '.gitignore and tracked files',
          description: 'Keeping build output, dependencies and secrets out of history - and what to do when one slipped in.',
          stageId: 'stage-8',
          tags: ['gitignore'],
          resources: [docs('gitignore documentation', `${GIT}/docs/gitignore`), link('gitignore templates (GitHub)', 'https://github.com/github/gitignore')]
        }
      ]
    },
    {
      id: 'branching',
      title: 'Branching and integrating',
      nodes: [
        {
          id: 'branches',
          title: 'Branches and switching',
          description: 'Cheap branches, switch/checkout, and keeping work-in-progress isolated.',
          stageId: 'stage-8',
          tags: ['branching'],
          resources: [book('Pro Git - Branches in a nutshell', `${GIT}/book/en/v2/Git-Branching-Branches-in-a-Nutshell`), practice('Learn Git Branching', 'https://learngitbranching.js.org/')]
        },
        {
          id: 'merge-rebase',
          title: 'Merge vs rebase',
          description: 'Merge commits vs rewritten history; the never-rebase-shared-commits rule; interactive rebase to tidy before review.',
          stageId: 'stage-8',
          tags: ['merge', 'rebase', 'history'],
          resources: [book('Pro Git - Rebasing', `${GIT}/book/en/v2/Git-Branching-Rebasing`), link('Merging vs rebasing (Atlassian)', 'https://www.atlassian.com/git/tutorials/merging-vs-rebasing')]
        },
        {
          id: 'conflicts',
          title: 'Resolving conflicts',
          description: 'Reading conflict markers, choosing or combining both sides, and finishing the merge or rebase.',
          stageId: 'stage-8',
          tags: ['merge-conflict'],
          resources: [book('Pro Git - Basic merge conflicts', `${GIT}/book/en/v2/Git-Branching-Basic-Branching-and-Merging`), docs('Resolving a merge conflict (GitHub)', `${GH}/pull-requests/collaborating-with-pull-requests/addressing-merge-conflicts/resolving-a-merge-conflict-using-the-command-line`)]
        },
        {
          id: 'remotes',
          title: 'Remotes: fetch, pull, push',
          description: 'Tracking branches, fetch vs pull, rejected pushes, and why force-push needs --force-with-lease at most.',
          stageId: 'stage-8',
          tags: ['remotes', 'workflow'],
          resources: [book('Pro Git - Working with remotes', `${GIT}/book/en/v2/Git-Basics-Working-with-Remotes`)]
        }
      ]
    },
    {
      id: 'undo',
      title: 'Undoing and inspecting',
      nodes: [
        {
          id: 'undo',
          title: 'restore, reset, revert, stash',
          description: 'Which command undoes what, which ones destroy work, and when to prefer a revert on shared branches.',
          stageId: 'stage-8',
          tags: ['reset', 'revert', 'restore', 'stash'],
          resources: [book('Pro Git - Undoing things', `${GIT}/book/en/v2/Git-Basics-Undoing-Things`), book('Pro Git - Reset demystified', `${GIT}/book/en/v2/Git-Tools-Reset-Demystified`)]
        },
        {
          id: 'reflog-bisect',
          title: 'reflog, blame and bisect',
          description: 'Recovering "lost" commits, finding who changed a line and why, and binary-searching for the commit that broke things.',
          stageId: 'stage-8',
          tags: ['debugging'],
          resources: [docs('git reflog', `${GIT}/docs/git-reflog`), docs('git bisect', `${GIT}/docs/git-bisect`), docs('git blame', `${GIT}/docs/git-blame`)]
        },
        {
          id: 'diffs',
          title: 'Reading and reviewing diffs',
          description: 'Unified diff format, hunk headers, and reviewing changes rather than files.',
          stageId: 'stage-8',
          tags: ['unified-diff', 'parsing'],
          resources: [docs('git diff', `${GIT}/docs/git-diff`), link('Unified diff format (GNU diffutils)', 'https://www.gnu.org/software/diffutils/manual/html_node/Unified-Format.html')]
        }
      ]
    },
    {
      id: 'github',
      title: 'GitHub and collaboration',
      nodes: [
        {
          id: 'pull-requests',
          title: 'Pull requests and code review',
          description: 'Small focused PRs, good descriptions, review comments, suggested changes, and merge strategies (merge, squash, rebase).',
          resources: [docs('About pull requests (GitHub)', `${GH}/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests`), docs('About merge methods (GitHub)', `${GH}/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github`)]
        },
        {
          id: 'workflows',
          title: 'Branching strategies',
          description: 'Trunk-based development, GitHub Flow, feature branches; protected branches and required reviews.',
          stageId: 'stage-8',
          tags: ['workflow', 'branching'],
          resources: [docs('GitHub flow', `${GH}/get-started/using-github/github-flow`), link('Trunk-based development', 'https://trunkbaseddevelopment.com/')]
        },
        {
          id: 'issues-projects',
          title: 'Issues, projects and discussions',
          description: 'Tracking work next to the code; templates, labels and linking PRs to issues.',
          optional: true,
          resources: [docs('About issues (GitHub)', `${GH}/issues/tracking-your-work-with-issues/about-issues`)]
        },
        {
          id: 'actions',
          title: 'GitHub Actions',
          description: 'Workflows that lint, test, build and deploy on every push; caching dependencies; required status checks.',
          stageId: 'stage-8',
          tags: ['ci', 'pipelines', 'automation'],
          resources: [docs('GitHub Actions documentation', `${GH}/actions`), docs('Workflow syntax', `${GH}/actions/writing-workflows/workflow-syntax-for-github-actions`)]
        },
        {
          id: 'releases-tags',
          title: 'Tags, releases and semantic versioning',
          description: 'Annotated tags, release notes, and MAJOR.MINOR.PATCH.',
          stageId: 'stage-8',
          tags: ['semver', 'versioning'],
          resources: [docs('Semantic Versioning', 'https://semver.org/'), docs('About releases (GitHub)', `${GH}/repositories/releasing-projects-on-github/about-releases`)]
        },
        {
          id: 'security-features',
          title: 'Dependabot and secret scanning',
          description: 'Automated dependency updates, vulnerability alerts and catching committed secrets.',
          stageId: 'stage-10',
          tags: ['secrets-scanning'],
          resources: [docs('Dependabot', `${GH}/code-security/dependabot`), docs('Secret scanning', `${GH}/code-security/secret-scanning`)]
        },
        {
          id: 'git-more',
          title: 'Keep going',
          description: 'Submodules, worktrees, hooks, signing commits - and the full community roadmap.',
          resources: [roadmapSh('git-github'), book('Pro Git (full book)', `${GIT}/book/en/v2`), practice('CodeConsist Stage 08 - Git, Tooling & Testing', '/dashboard/learn')]
        }
      ]
    }
  ]
};
