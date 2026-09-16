import type { Roadmap } from '../../types';
import { MDN, course, docs, link, practice, roadmapSh, video } from './helpers';

export const frontend: Roadmap = {
  slug: 'frontend',
  title: 'Frontend Developer',
  kind: 'role',
  icon: '🖥️',
  description: 'Everything between the browser and the user: HTML, CSS, JavaScript, a framework, tooling, testing, performance and accessibility.',
  roadmapShUrl: 'https://roadmap.sh/frontend',
  sections: [
    {
      id: 'internet',
      title: 'How the web works',
      description: 'The plumbing under every page. You do not need to be an expert, but you need the picture.',
      nodes: [
        {
          id: 'how-internet-works',
          title: 'How the internet works',
          description: 'Packets, IP addresses, routers, and why a request from your laptop reaches a server on another continent in under 100ms.',
          resources: [
            link('How does the Internet work? (MDN)', `${MDN}/Learn_web_development/Howto/Web_mechanics/How_does_the_Internet_work`),
            link('How the web works (web.dev)', 'https://web.dev/articles/howbrowserswork')
          ]
        },
        {
          id: 'http',
          title: 'HTTP',
          description: 'The request/response protocol browsers speak: methods, status codes, headers, and the differences between HTTP/1.1, 2 and 3.',
          stageId: 'stage-6',
          tags: ['http', 'status-codes', 'headers'],
          resources: [docs('HTTP overview (MDN)', `${MDN}/Web/HTTP/Overview`), docs('HTTP status codes (MDN)', `${MDN}/Web/HTTP/Status`)]
        },
        {
          id: 'dns-domains-hosting',
          title: 'DNS, domains and hosting',
          description: 'How a name becomes an address, what a registrar does, and the difference between static hosting, a VPS and a platform.',
          resources: [
            link('What is DNS? (Cloudflare Learning)', 'https://www.cloudflare.com/learning/dns/what-is-dns/'),
            link('What is a web server? (MDN)', `${MDN}/Learn_web_development/Howto/Web_mechanics/What_is_a_web_server`)
          ]
        },
        {
          id: 'browsers',
          title: 'How browsers render',
          description: 'Parsing HTML into the DOM, CSS into the CSSOM, layout, paint and composite - the pipeline every performance fix targets.',
          stageId: 'stage-5',
          tags: ['browser', 'dom'],
          resources: [
            link('Populating the page: how browsers work (MDN)', `${MDN}/Web/Performance/How_browsers_work`),
            link('Rendering performance (web.dev)', 'https://web.dev/articles/rendering-performance')
          ]
        }
      ]
    },
    {
      id: 'html-css',
      title: 'HTML & CSS',
      nodes: [
        {
          id: 'semantic-html',
          title: 'Semantic HTML',
          description: 'Elements that carry meaning - nav, main, article, button - so browsers, search engines and assistive tech understand the page.',
          stageId: 'stage-5',
          tags: ['semantic-html', 'accessibility'],
          resources: [docs('HTML elements reference (MDN)', `${MDN}/Web/HTML/Element`), course('Learn HTML (web.dev)', 'https://web.dev/learn/html')]
        },
        {
          id: 'forms',
          title: 'Forms and validation',
          description: 'Inputs, labels, built-in constraint validation, and submitting without losing accessibility.',
          resources: [docs('Web forms (MDN)', `${MDN}/Learn_web_development/Extensions/Forms`), course('Learn Forms (web.dev)', 'https://web.dev/learn/forms')]
        },
        {
          id: 'css-fundamentals',
          title: 'CSS fundamentals: cascade, specificity, box model',
          description: 'Why a rule wins or loses, how width is actually calculated, and units that scale.',
          stageId: 'stage-5',
          tags: ['css', 'specificity', 'cascade', 'box-model'],
          resources: [course('Learn CSS (web.dev)', 'https://web.dev/learn/css'), docs('Specificity (MDN)', `${MDN}/Web/CSS/Specificity`), docs('The box model (MDN)', `${MDN}/Web/CSS/CSS_box_model/Introduction_to_the_CSS_box_model`)]
        },
        {
          id: 'layout',
          title: 'Layout: Flexbox and Grid',
          description: 'One-dimensional layout with flexbox, two-dimensional with grid, and when to reach for each.',
          stageId: 'stage-5',
          tags: ['flexbox', 'grid'],
          resources: [docs('Flexbox (MDN)', `${MDN}/Web/CSS/CSS_flexible_box_layout`), docs('Grid (MDN)', `${MDN}/Web/CSS/CSS_grid_layout`), practice('Flexbox Froggy', 'https://flexboxfroggy.com/'), practice('Grid Garden', 'https://cssgridgarden.com/')]
        },
        {
          id: 'responsive',
          title: 'Responsive design',
          description: 'Media and container queries, fluid type, and designing for the smallest screen first.',
          resources: [docs('Responsive design (MDN)', `${MDN}/Learn_web_development/Core/CSS_layout/Responsive_Design`), course('Learn Responsive Design (web.dev)', 'https://web.dev/learn/design')]
        },
        {
          id: 'css-architecture',
          title: 'CSS architecture and Tailwind',
          description: 'Keeping styles maintainable at scale: naming conventions, CSS modules, utility-first CSS.',
          optional: true,
          resources: [docs('Tailwind CSS docs', 'https://tailwindcss.com/docs'), docs('CSS Modules', 'https://github.com/css-modules/css-modules')]
        }
      ]
    },
    {
      id: 'javascript',
      title: 'JavaScript',
      nodes: [
        {
          id: 'js-basics',
          title: 'Syntax, types and control flow',
          description: 'Variables, coercion, truthiness, loops and functions - the basics everything else assumes.',
          stageId: 'stage-1',
          tags: ['coercion', 'loops', 'functions'],
          resources: [docs('JavaScript Guide (MDN)', `${MDN}/Web/JavaScript/Guide`), link('The Modern JavaScript Tutorial', 'https://javascript.info/')]
        },
        {
          id: 'dom-events',
          title: 'DOM manipulation and events',
          description: 'Querying and changing the page, event bubbling and delegation.',
          stageId: 'stage-5',
          tags: ['dom', 'events', 'delegation'],
          resources: [docs('Document Object Model (MDN)', `${MDN}/Web/API/Document_Object_Model`), docs('Introduction to events (MDN)', `${MDN}/Learn_web_development/Core/Scripting/Events`)]
        },
        {
          id: 'async-js',
          title: 'Asynchronous JavaScript',
          description: 'The event loop, promises, async/await, and fetch - how the browser does many things with one thread.',
          stageId: 'stage-5',
          tags: ['async', 'promises', 'event-loop', 'fetch'],
          resources: [docs('Using promises (MDN)', `${MDN}/Web/JavaScript/Guide/Using_promises`), docs('Fetch API (MDN)', `${MDN}/Web/API/Fetch_API`), link('Event loop (javascript.info)', 'https://javascript.info/event-loop')]
        },
        {
          id: 'modules',
          title: 'ES modules',
          description: 'import/export, how bundlers resolve them, and why modules are the unit of code splitting.',
          resources: [docs('JavaScript modules (MDN)', `${MDN}/Web/JavaScript/Guide/Modules`)]
        },
        {
          id: 'typescript',
          title: 'TypeScript',
          description: 'Static types for JavaScript: catching mistakes before they run and documenting intent in the code.',
          resources: [docs('TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/intro.html'), link('typescript roadmap on roadmap.sh', 'https://roadmap.sh/typescript', 'roadmap')]
        }
      ]
    },
    {
      id: 'tooling',
      title: 'Tooling',
      nodes: [
        {
          id: 'git',
          title: 'Version control with Git',
          description: 'Commits, branches, merges and pull requests - non-negotiable on any team.',
          stageId: 'stage-8',
          tags: ['git'],
          resources: [docs('Pro Git book', 'https://git-scm.com/book/en/v2'), practice('Learn Git Branching', 'https://learngitbranching.js.org/')]
        },
        {
          id: 'package-managers',
          title: 'npm and package managers',
          description: 'package.json, lockfiles, semver ranges and the difference between npm install and npm ci.',
          stageId: 'stage-8',
          tags: ['npm', 'lockfiles', 'semver'],
          resources: [docs('npm docs', 'https://docs.npmjs.com/'), docs('pnpm docs', 'https://pnpm.io/motivation')]
        },
        {
          id: 'build-tools',
          title: 'Build tools: Vite and bundlers',
          description: 'Dev servers with hot reload, production bundling, code splitting and tree shaking.',
          resources: [docs('Vite guide', 'https://vite.dev/guide/'), docs('esbuild', 'https://esbuild.github.io/')]
        },
        {
          id: 'linting',
          title: 'Linting and formatting',
          description: 'ESLint for likely bugs, Prettier for style, both in the editor and in CI.',
          stageId: 'stage-8',
          tags: ['linting', 'formatting'],
          resources: [docs('ESLint', 'https://eslint.org/docs/latest/'), docs('Prettier', 'https://prettier.io/docs/')]
        }
      ]
    },
    {
      id: 'framework',
      title: 'A framework',
      description: 'Pick one and go deep. React has the largest job market; Vue and Svelte are gentler; Angular is common in enterprises.',
      nodes: [
        {
          id: 'react',
          title: 'React',
          description: 'Components, props, state, effects and hooks. The de-facto default in most job listings.',
          resources: [docs('React - Learn', 'https://react.dev/learn'), link('react roadmap on roadmap.sh', 'https://roadmap.sh/react', 'roadmap')]
        },
        {
          id: 'vue',
          title: 'Vue',
          description: 'Reactive templates with a gentle learning curve and excellent docs.',
          optional: true,
          resources: [docs('Vue guide', 'https://vuejs.org/guide/introduction.html'), link('vue roadmap on roadmap.sh', 'https://roadmap.sh/vue', 'roadmap')]
        },
        {
          id: 'svelte-angular',
          title: 'Svelte or Angular',
          description: 'Svelte compiles away the framework; Angular is a full, opinionated platform.',
          optional: true,
          resources: [docs('Svelte docs', 'https://svelte.dev/docs'), docs('Angular docs', 'https://angular.dev/overview'), link('angular roadmap on roadmap.sh', 'https://roadmap.sh/angular', 'roadmap')]
        },
        {
          id: 'state-routing',
          title: 'State management and routing',
          description: 'Where shared state lives, server vs client state, and client-side routing.',
          resources: [docs('React Router', 'https://reactrouter.com/'), docs('TanStack Query', 'https://tanstack.com/query/latest/docs/framework/react/overview'), docs('Zustand', 'https://zustand.docs.pmnd.rs/')]
        },
        {
          id: 'meta-frameworks',
          title: 'Meta-frameworks and SSR',
          description: 'Next.js, Nuxt, SvelteKit: server rendering, routing conventions and data loading in one package.',
          optional: true,
          resources: [docs('Next.js docs', 'https://nextjs.org/docs'), link('nextjs roadmap on roadmap.sh', 'https://roadmap.sh/nextjs', 'roadmap')]
        }
      ]
    },
    {
      id: 'quality',
      title: 'Quality',
      nodes: [
        {
          id: 'testing',
          title: 'Testing',
          description: 'Unit tests with Vitest or Jest, component tests with Testing Library, end-to-end with Playwright.',
          stageId: 'stage-8',
          tags: ['testing', 'unit-tests'],
          resources: [docs('Vitest', 'https://vitest.dev/guide/'), docs('Testing Library', 'https://testing-library.com/docs/'), docs('Playwright', 'https://playwright.dev/docs/intro')]
        },
        {
          id: 'accessibility',
          title: 'Accessibility',
          description: 'Keyboard navigation, focus, labels, contrast and ARIA where native semantics run out.',
          stageId: 'stage-5',
          tags: ['accessibility', 'aria'],
          resources: [course('Learn Accessibility (web.dev)', 'https://web.dev/learn/accessibility'), docs('Accessibility (MDN)', `${MDN}/Web/Accessibility`), docs('WCAG quick reference', 'https://www.w3.org/WAI/WCAG22/quickref/')]
        },
        {
          id: 'performance',
          title: 'Web performance',
          description: 'Core Web Vitals, code splitting, image optimisation, caching and measuring before optimising.',
          stageId: 'stage-10',
          tags: ['performance-budget', 'bundle-size'],
          resources: [link('Web Vitals (web.dev)', 'https://web.dev/articles/vitals'), course('Learn Performance (web.dev)', 'https://web.dev/learn/performance'), docs('Web performance (MDN)', `${MDN}/Web/Performance`)]
        },
        {
          id: 'security',
          title: 'Web security',
          description: 'XSS, CSRF, CORS, CSP and safe handling of user input.',
          stageId: 'stage-5',
          tags: ['xss', 'security', 'cors'],
          resources: [docs('Web security (MDN)', `${MDN}/Web/Security`), docs('CORS (MDN)', `${MDN}/Web/HTTP/CORS`), docs('Content Security Policy (MDN)', `${MDN}/Web/HTTP/CSP`)]
        }
      ]
    },
    {
      id: 'beyond',
      title: 'Beyond the basics',
      nodes: [
        {
          id: 'pwa',
          title: 'PWAs and service workers',
          description: 'Offline support, install prompts and background sync via the service worker.',
          optional: true,
          resources: [course('Learn PWA (web.dev)', 'https://web.dev/learn/pwa'), docs('Service Worker API (MDN)', `${MDN}/Web/API/Service_Worker_API`)]
        },
        {
          id: 'web-components',
          title: 'Web Components',
          description: 'Custom elements and shadow DOM: framework-agnostic components built into the browser.',
          optional: true,
          resources: [docs('Web Components (MDN)', `${MDN}/Web/API/Web_components`)]
        },
        {
          id: 'graphql-rest',
          title: 'Talking to APIs: REST and GraphQL',
          description: 'Fetching data, caching it, handling errors and loading states.',
          stageId: 'stage-6',
          tags: ['rest', 'api-design'],
          resources: [docs('GraphQL', 'https://graphql.org/learn/'), link('api-design roadmap on roadmap.sh', 'https://roadmap.sh/api-design', 'roadmap')]
        },
        {
          id: 'frontend-more',
          title: 'Keep going',
          description: 'Animation, WebSockets, WebAssembly, design systems - and the full community roadmap.',
          resources: [roadmapSh('frontend'), video('Frontend Masters (paid)', 'https://frontendmasters.com/'), link('The Odin Project (free)', 'https://www.theodinproject.com/')]
        }
      ]
    }
  ]
};
