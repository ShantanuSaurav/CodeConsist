import type { Roadmap } from '../../types';
import { PY, book, course, docs, link, practice, roadmapSh } from './helpers';

export const python: Roadmap = {
  slug: 'python',
  title: 'Python',
  kind: 'skill',
  icon: '🐍',
  description: 'From syntax and the built-in containers to packaging, testing, typing and the web and data ecosystems.',
  roadmapShUrl: 'https://roadmap.sh/python',
  sections: [
    {
      id: 'basics',
      title: 'Language basics',
      nodes: [
        {
          id: 'syntax',
          title: 'Syntax, variables and operators',
          description: 'Indentation as structure, dynamic typing, arithmetic including // and %, comparison chaining, and/or semantics.',
          stageId: 'stage-2',
          tags: ['arithmetic', 'floor-division', 'modulo', 'operators'],
          resources: [docs('The Python Tutorial', `${PY}/tutorial/`), docs('An informal introduction (tutorial §3)', `${PY}/tutorial/introduction.html`)]
        },
        {
          id: 'control-flow',
          title: 'Control flow',
          description: 'if/elif/else, for over iterables, while, break/continue/else, match statements, truthiness of containers.',
          stageId: 'stage-2',
          tags: ['conditionals', 'truthiness'],
          resources: [docs('More control flow tools (tutorial §4)', `${PY}/tutorial/controlflow.html`)]
        },
        {
          id: 'functions',
          title: 'Functions and arguments',
          description: 'Positional, keyword, default and *args/**kwargs; the mutable-default trap; lambda; docstrings.',
          stageId: 'stage-2',
          tags: ['default-arguments', 'unpacking'],
          resources: [docs('Defining functions (tutorial §4.8)', `${PY}/tutorial/controlflow.html#defining-functions`)]
        },
        {
          id: 'strings',
          title: 'Strings and f-strings',
          description: 'Immutable sequences, slicing, split/join/strip, and f-string format specs.',
          stageId: 'stage-2',
          tags: ['strings', 'f-strings', 'formatting', 'split', 'strip'],
          resources: [docs('Text sequence type - str', `${PY}/library/stdtypes.html#text-sequence-type-str`), docs('Format specification mini-language', `${PY}/library/string.html#formatspec`)]
        }
      ]
    },
    {
      id: 'containers',
      title: 'Containers and iteration',
      nodes: [
        {
          id: 'lists-tuples',
          title: 'Lists, tuples and slicing',
          description: 'Mutable vs immutable sequences, negative indexes, slice copies, sort vs sorted.',
          stageId: 'stage-2',
          tags: ['lists', 'tuples', 'slicing', 'negative-index', 'sorting'],
          resources: [docs('Data structures (tutorial §5)', `${PY}/tutorial/datastructures.html`), docs('Sorting techniques (HOWTO)', `${PY}/howto/sorting.html`)]
        },
        {
          id: 'dicts-sets',
          title: 'Dicts and sets',
          description: 'Hashable keys, .get with defaults, Counter and defaultdict, set algebra.',
          stageId: 'stage-2',
          tags: ['dicts', 'sets', 'hashing', 'counting', 'get', 'defaults'],
          resources: [docs('Dictionaries (tutorial §5.5)', `${PY}/tutorial/datastructures.html#dictionaries`), docs('collections module', `${PY}/library/collections.html`)]
        },
        {
          id: 'comprehensions',
          title: 'Comprehensions',
          description: 'List, set and dict comprehensions with filters; when a loop is clearer.',
          stageId: 'stage-2',
          tags: ['comprehensions', 'filtering'],
          resources: [docs('List comprehensions (tutorial §5.1.3)', `${PY}/tutorial/datastructures.html#list-comprehensions`)]
        },
        {
          id: 'iteration',
          title: 'Iteration tools',
          description: 'enumerate, zip, reversed, itertools, and the iterator protocol under for.',
          stageId: 'stage-2',
          tags: ['enumerate', 'zip', 'iterables'],
          resources: [docs('itertools', `${PY}/library/itertools.html`), docs('Functional programming HOWTO', `${PY}/howto/functional.html`)]
        },
        {
          id: 'generators',
          title: 'Generators and lazy evaluation',
          description: 'yield, generator expressions, and pipelines that never hold everything in memory.',
          stageId: 'stage-2',
          tags: ['generators', 'lazy-evaluation'],
          resources: [docs('Generators (tutorial §9.9)', `${PY}/tutorial/classes.html#generators`)]
        }
      ]
    },
    {
      id: 'model',
      title: 'The object model',
      nodes: [
        {
          id: 'references',
          title: 'References, mutability and identity',
          description: 'Names bind to objects; == vs is; copy vs deepcopy; arguments are passed by reference.',
          stageId: 'stage-2',
          tags: ['mutability', 'references', 'identity', 'equality'],
          resources: [docs('copy module', `${PY}/library/copy.html`), link('Facts and myths about Python names and values', 'https://nedbatchelder.com/text/names.html')]
        },
        {
          id: 'classes',
          title: 'Classes, dataclasses and dunder methods',
          description: '__init__, __repr__, __eq__, properties, @dataclass, and inheritance vs composition.',
          resources: [docs('Classes (tutorial §9)', `${PY}/tutorial/classes.html`), docs('dataclasses', `${PY}/library/dataclasses.html`)]
        },
        {
          id: 'exceptions',
          title: 'Exceptions',
          description: 'try/except/else/finally, catching narrowly, raising with context, custom exception classes.',
          stageId: 'stage-2',
          tags: ['exceptions', 'try-except', 'error-handling'],
          resources: [docs('Errors and exceptions (tutorial §8)', `${PY}/tutorial/errors.html`)]
        },
        {
          id: 'typing',
          title: 'Type hints',
          description: 'Annotations, Optional and unions, generics, and checking with mypy or pyright.',
          resources: [docs('typing module', `${PY}/library/typing.html`), docs('mypy documentation', 'https://mypy.readthedocs.io/en/stable/')]
        }
      ]
    },
    {
      id: 'tooling',
      title: 'Tooling',
      nodes: [
        {
          id: 'venv-packaging',
          title: 'Virtual environments and packaging',
          description: 'venv, pip, pyproject.toml, lockfiles with uv or Poetry; one environment per project.',
          resources: [docs('venv', `${PY}/library/venv.html`), docs('Python Packaging User Guide', 'https://packaging.python.org/en/latest/'), docs('uv', 'https://docs.astral.sh/uv/')]
        },
        {
          id: 'testing',
          title: 'Testing with pytest',
          description: 'Plain assert tests, fixtures, parametrize, and mocking the boundary.',
          stageId: 'stage-8',
          tags: ['testing', 'unit-tests'],
          resources: [docs('pytest', 'https://docs.pytest.org/en/stable/'), docs('unittest.mock', `${PY}/library/unittest.mock.html`)]
        },
        {
          id: 'style',
          title: 'Style and linting',
          description: 'PEP 8, Black or Ruff for formatting, Ruff for linting.',
          resources: [docs('PEP 8', 'https://peps.python.org/pep-0008/'), docs('Ruff', 'https://docs.astral.sh/ruff/')]
        },
        {
          id: 'stdlib',
          title: 'The standard library',
          description: 'pathlib, json, datetime, re, logging, argparse, functools, concurrent.futures - batteries included.',
          resources: [docs('The Python Standard Library', `${PY}/library/index.html`), docs('Brief tour of the standard library (tutorial §10)', `${PY}/tutorial/stdlib.html`)]
        }
      ]
    },
    {
      id: 'ecosystem',
      title: 'Where Python goes',
      nodes: [
        {
          id: 'web',
          title: 'Web: FastAPI, Django, Flask',
          description: 'FastAPI for typed APIs, Django for batteries-included apps, Flask for small services.',
          optional: true,
          resources: [docs('FastAPI', 'https://fastapi.tiangolo.com/'), docs('Django', 'https://docs.djangoproject.com/en/stable/'), docs('Flask', 'https://flask.palletsprojects.com/')]
        },
        {
          id: 'data',
          title: 'Data: NumPy and pandas',
          description: 'Arrays and dataframes for analysis; the on-ramp to data science and ML.',
          optional: true,
          resources: [docs('NumPy user guide', 'https://numpy.org/doc/stable/user/'), docs('pandas user guide', 'https://pandas.pydata.org/docs/user_guide/index.html'), link('ai-data-scientist roadmap on roadmap.sh', 'https://roadmap.sh/ai-data-scientist', 'roadmap')]
        },
        {
          id: 'async',
          title: 'asyncio and concurrency',
          description: 'async/await, the event loop, threads vs processes and the GIL.',
          optional: true,
          resources: [docs('asyncio', `${PY}/library/asyncio.html`), docs('concurrent.futures', `${PY}/library/concurrent.futures.html`)]
        },
        {
          id: 'py-more',
          title: 'Keep going',
          description: 'Decorators, context managers, metaclasses, performance profiling - and the full community roadmap.',
          resources: [roadmapSh('python'), course('Real Python tutorials', 'https://realpython.com/'), book('Automate the Boring Stuff (free)', 'https://automatetheboringstuff.com/'), practice('Devlingo Stage 02 - Python Fundamentals', '/dashboard/learn')]
        }
      ]
    }
  ]
};
