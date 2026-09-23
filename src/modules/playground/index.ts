/**
 * Public API of the playground module.
 * Owns: the free-form editor + console, and the HTML/CSS/JS mode. Emits practice:open.
 */
export { PlaygroundPage } from './pages/PlaygroundPage';
export { Playground } from './components/Playground';
/** The web mode on its own. `Playground` already swaps it in; this is for a page that wants only it. */
export { WebPlayground } from './components/WebPlayground';
