import type { Roadmap } from '@/types';
import { MDN, PG, book, course, docs, link, practice, roadmapSh } from './helpers';

export const roadmap: Roadmap = {
  slug: 'full-stack',
  order: 3,
  title: 'Full Stack Developer',
  kind: 'role',
  icon: '🧩',
  description: 'One person, whole feature: a pragmatic path through the frontend, backend and deployment essentials in the order you will need them.',
  roadmapShUrl: 'https://roadmap.sh/full-stack',
  sections: [
    {
      id: 'front',
      title: 'Frontend essentials',
      nodes: [
        {
          id: 'html-css',
          title: 'HTML & CSS',
          description: 'Semantic markup, the cascade and box model, flexbox and grid, responsive layout.',
          stageId: 'stage-5',
          tags: ['css', 'semantic-html', 'flexbox', 'grid'],
          resources: [course('Learn HTML (web.dev)', 'https://web.dev/learn/html'), course('Learn CSS (web.dev)', 'https://web.dev/learn/css')]
        },
        {
          id: 'javascript',
          title: 'JavaScript',
          description: 'The language: types, functions, closures, arrays and objects, async.',
          stageId: 'stage-1',
          tags: ['functions', 'closures', 'arrays'],
          resources: [link('The Modern JavaScript Tutorial', 'https://javascript.info/'), link('javascript roadmap on roadmap.sh', 'https://roadmap.sh/javascript', 'roadmap'), practice('Devlingo Stage 01', '/dashboard/learn')]
        },
        {
          id: 'dom-browser',
          title: 'The DOM, events and fetch',
          description: 'Making pages interactive and talking to an API from the browser.',
          stageId: 'stage-5',
          tags: ['dom', 'events', 'fetch'],
          resources: [docs('DOM (MDN)', `${MDN}/Web/API/Document_Object_Model`), docs('Fetch API (MDN)', `${MDN}/Web/API/Fetch_API`)]
        },
        {
          id: 'react',
          title: 'React (or another framework)',
          description: 'Components, state, effects and routing. Build two or three small apps before moving on.',
          resources: [docs('React - Learn', 'https://react.dev/learn'), link('react roadmap on roadmap.sh', 'https://roadmap.sh/react', 'roadmap')]
        }
      ]
    },
    {
      id: 'back',
      title: 'Backend essentials',
      nodes: [
        {
          id: 'node-express',
          title: 'Node.js and a framework',
          description: 'Express or Fastify: routes, middleware, JSON bodies, error handling.',
          stageId: 'stage-6',
          tags: ['express', 'middleware', 'routing'],
          resources: [docs('Node.js - Learn', 'https://nodejs.org/en/learn'), docs('Express', 'https://expressjs.com/')]
        },
        {
          id: 'rest-api',
          title: 'Designing a REST API',
          description: 'Resources, methods, status codes, validation, pagination and consistent errors.',
          stageId: 'stage-6',
          tags: ['rest', 'api-design', 'status-codes', 'input-validation'],
          resources: [link('api-design roadmap on roadmap.sh', 'https://roadmap.sh/api-design', 'roadmap'), docs('HTTP status codes (MDN)', `${MDN}/Web/HTTP/Status`)]
        },
        {
          id: 'auth',
          title: 'Authentication',
          description: 'Password hashing, sessions or JWTs, protecting routes, and checking ownership of resources.',
          stageId: 'stage-6',
          tags: ['authentication', 'jwt', 'password-hashing', 'idor'],
          resources: [docs('Password storage cheat sheet (OWASP)', 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html'), link('Introduction to JSON Web Tokens', 'https://jwt.io/introduction')]
        },
        {
          id: 'database',
          title: 'A relational database',
          description: 'PostgreSQL: schema design, joins, indexes, transactions, migrations.',
          stageId: 'stage-7',
          tags: ['sql', 'join', 'indexes', 'schema-design'],
          resources: [docs('PostgreSQL tutorial', `${PG}/tutorial.html`), practice('SQLBolt', 'https://sqlbolt.com/'), link('sql roadmap on roadmap.sh', 'https://roadmap.sh/sql', 'roadmap')]
        }
      ]
    },
    {
      id: 'glue',
      title: 'Putting it together',
      nodes: [
        {
          id: 'git-testing',
          title: 'Git, testing and CI',
          description: 'Branches and PRs, unit and integration tests, a pipeline that runs them on every push.',
          stageId: 'stage-8',
          tags: ['git', 'testing', 'ci'],
          resources: [book('Pro Git', 'https://git-scm.com/book/en/v2'), docs('Vitest', 'https://vitest.dev/guide/'), docs('GitHub Actions', 'https://docs.github.com/en/actions')]
        },
        {
          id: 'typescript',
          title: 'TypeScript across the stack',
          description: 'Shared types between client and server catch a whole class of bugs.',
          resources: [docs('TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/intro.html')]
        },
        {
          id: 'deploy',
          title: 'Deploying',
          description: 'Environment config and secrets, a container or a platform, HTTPS, a rollback plan.',
          stageId: 'stage-10',
          tags: ['deployment', 'environment-config', 'secrets', 'rollback'],
          resources: [docs('Docker - Get started', 'https://docs.docker.com/get-started/'), link('The Twelve-Factor App', 'https://12factor.net/')]
        },
        {
          id: 'observe',
          title: 'Logs, metrics and errors in production',
          description: 'Structured logs with request ids, latency percentiles, error tracking, alerts that mean something.',
          stageId: 'stage-10',
          tags: ['structured-logging', 'metrics', 'error-tracking'],
          resources: [docs('OpenTelemetry', 'https://opentelemetry.io/docs/')]
        },
        {
          id: 'scale',
          title: 'Caching and scaling basics',
          description: 'HTTP caching, a Redis cache, stateless servers behind a load balancer.',
          stageId: 'stage-9',
          tags: ['caching', 'load-balancing', 'statelessness'],
          resources: [link('System Design Primer', 'https://github.com/donnemartin/system-design-primer'), link('system-design roadmap on roadmap.sh', 'https://roadmap.sh/system-design', 'roadmap')]
        },
        {
          id: 'fs-more',
          title: 'Keep going',
          description: 'Go deeper on either side with the Frontend and Backend roadmaps, or follow the community version.',
          resources: [roadmapSh('full-stack'), course('Full Stack Open (University of Helsinki)', 'https://fullstackopen.com/en/'), link('The Odin Project', 'https://www.theodinproject.com/')]
        }
      ]
    }
  ]
};
