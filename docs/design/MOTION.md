# Motion and surface system

**Direction: calm precision.** Think Linear, Vercel, Stripe. Motion explains a change: where
something came from, what changed, what now has focus. It never decorates.
Source files: `src/ui/theme/tokens.css` (tokens), `src/ui/theme/components.css` (classes, "Motion
system" section at the end), `src/ui/motion.ts` and `src/ui/hooks/*` (JS). Import JS from `@/ui` only.

## Rules

- No bounce, no overshoot, no rotation or wobble, no parallax, no glow or pulse loops (skeleton
  sheen and the splash are the only loops), no confetti or emoji on routine actions.
- Scale stays between 0.98 and 1.02. Press = `scale(0.98)` (cards 0.99). Distances are 4, 8 or 12px
  (up to 16px for landing reveals only).
- Entrances ease out (`--ease-out`). Exits are one duration step shorter and ease in (`--ease-in`).
  A move between two resting states (thumb, indicator, switch) eases both ways (`--ease-in-out`).
- Move things with `transform` and `opacity` only. Colour, background, border, box-shadow and
  outline may transition on hover/focus. Never animate width/height/top/left/margin
  (`.progress-fill` width is the one exception).
- Never hard-code a duration or curve in CSS: use the tokens. In JS use `MOTION.*`.
- Entrance classes use `animation-fill-mode: backwards`: the resting state is the element's own
  style, so nothing can be left invisible if an animation is skipped. Never set `opacity: 0` in a
  base style and rely on JS to reveal it.
- Page content must be on screen within 320ms of a navigation. No exit animation may delay a route.
- Reduced motion (`prefers-reduced-motion`): tokens.css makes every animation, transition and delay
  instant; components.css removes hover/press transforms. If you add a hover/press transform, add
  it to the reduced-motion block (`transform: none`). JS: `prefersReducedMotion()`.
- Static panels never lift. Only whole-card click targets use `.card-interactive`.

## Tokens (tokens.css)

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | entrances, hover |
| `--ease-in` | `cubic-bezier(0.55, 0, 1, 0.45)` | exits |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | moves, state changes |
| `--dur-instant` | 80ms | press feedback |
| `--dur-fast` | 140ms | hover, colour, menu/toast exits |
| `--dur-base` | 220ms | menus, toasts, small enters, dialog/drawer exits, theme fade, sliding thumb and sidebar indicator |
| `--dur-slow` | 320ms | page enter, dialogs, drawers |
| `--dur-slower` | 480ms | landing scroll reveals, progress fills |
| `--dur-shimmer` | 1.6s | one skeleton sheen loop |
| `--delay-skeleton` | 120ms | wait before a page skeleton fades in (fast loads never flash one) |
| `--shift-sm` / `-md` / `-lg` | 4 / 8 / 12px | travel distances |
| `--stagger` | 40ms | per-item list delay, capped at 6 items (last delay 200ms) |
| `--shadow-xs` | | controls (secondary/primary buttons, segmented thumb) |
| `--shadow-sm` | | hovered interactive card |
| `--shadow-md` | | raised, non-floating emphasis (popover cards) |
| `--shadow-menu` / `--shadow-dialog` | | floating layers |
| `--surface-highlight` | none / 1px lit top edge in dark | put first in any raised surface's box-shadow list |
| `--btn-highlight`, `--control-raised`, `--overlay`, `--focus-ring` | | primary edge, raised segment, scrim, field focus |
| `--radius-xs/sm/md/lg/xl` | 4 / 6 / 8 / 12 / 16px | tags / controls / menus / panels / dialogs |
| `--tracking-tight` / `--tracking-snug` | -0.02em / -0.01em | h1-h2 (set globally) / titles, figures |

Legacy aliases still work: `--ease` = `--ease-out`, `--fast` = `--dur-fast`, `--med` = `--dur-base`.
Tailwind: `rounded-xl` = 16px, `shadow-xs/sm/md/menu/dialog` map to the tokens, and bare
`transition` / `transition-colors` utilities default to `--dur-fast` + `--ease-out`.
Shared transition lists in components.css: `var(--t-colors)` (colour, bg, border, shadow) and
`var(--t-focus)` (outline). Example: `transition: var(--t-colors), transform var(--dur-base) var(--ease-out);`

## One-shot entrance classes

| Class | Motion | Example |
|---|---|---|
| `.page-enter` | fade + rise 8px, 320ms | root of a full-page route (landing, certificate, admin) |
| `.anim-fade-up` | same as page-enter | `<section className="anim-fade-up">` |
| `.anim-fade` / `.content-fade-in` | opacity, 220ms | content that replaces a skeleton |
| `.anim-scale-in` | fade + 0.98 → 1, 220ms | a result card appearing in place |
| `.stagger` | direct children fade + rise 4px, 220ms, 40ms apart, capped at 6 items (the sixth onward share 200ms) | `<ul className="stagger">` |
| `.stagger-item` + `staggerStyle(i)` | same, for non-direct children | `<li className="stagger-item" style={staggerStyle(i)}>` |

They play on mount only. Do not remount (`key` churn) just to replay them. Inside dashboard pages
the page itself already enters (DashboardLayout), so use `.stagger` for the first list/grid of a
page at most, not for every section.

## Presence: enter + exit (`data-state`)

Render with `data-state="open"` (or no attribute) to enter, flip to `"closed"` to exit, unmount
after the exit. Closed elements get `pointer-events: none`.

```tsx
const menu = usePresence(open, MOTION.fast);     // { mounted, state }
{menu.mounted && <div className="menu-surface" data-state={menu.state}>…</div>}
```

| Class | Enter | Exit | `usePresence` exitMs |
|---|---|---|---|
| `.menu-surface` | fade, -4px, 0.98 → 1, 220ms, origin top | reverse, 140ms | `MOTION.fast` |
| `.overlay-backdrop` | fade 220ms (also paints `--overlay`) | fade 220ms | `MOTION.base` |
| `.presence-fade` | fade 220ms | fade 220ms | `MOTION.base` |
| `.dialog-surface` | fade, +8px, 0.98 → 1, 320ms | fade, +4px, 0.98, 220ms | `MOTION.base` |
| `.drawer-surface` | slide from left 320ms (`data-side="right"` flips) | slide out 220ms | `MOTION.base` |
| `.presence-fade.drawer-companion` | fade 220ms after a 140ms wait (lands with the drawer) | fade 220ms | `MOTION.base` |
| `.toast` | handled by ToastProvider: rise in, slide right on dismiss (also when the 4-live cap evicts one) | | |

A modal = one `usePresence(open, MOTION.base)`; put `data-state` on the backdrop and the panel,
and `pointer-events-none` on any full-screen wrapper while closed. Keep `useFocusTrap`,
`useBodyScrollLock` and Escape handling tied to `open`, not to `mounted`.

## Hooks and helpers (`@/ui`)

- `usePresence(open, exitMs)` → `{ mounted, state: 'open' | 'closed' }`. Reduced motion → exit 0.
- `useSlidingIndicator(rootRef, indicatorRef, selector, 'x' | 'y', activeKey)` → glides one
  absolutely positioned indicator to `root.querySelector(selector)` whenever `activeKey` changes
  (transform-only FLIP; the root must be `position: relative`). Sets `[data-indicator]` on the root
  while placed. Used by `Segmented`, `LearningModeSwitch` (thumb `.segmented-thumb`) and the
  Sidebar (`.nav-indicator`). Example: `useSlidingIndicator(ref, thumbRef, '.is-active', 'x', tab)`.
- `useReveal(ref)` + `.reveal` → fade + rise 12px over 480ms the first time it scrolls into view.
  Only hides elements confirmed below the fold with IntersectionObserver available; never stuck.
- `MOTION` = `{ instant: 80, fast: 140, base: 220, slow: 320, slower: 480, stagger: 40, staggerCap: 6 }`.
- `prefersReducedMotion()`; `staggerStyle(i)` (clamps to index 5, matching `.stagger`).

## Components already wired

- Buttons (`.btn`): colour 140ms, press `scale(0.98)` in 80ms, focus ring grows in; primary has a
  lit top edge + `--shadow-xs`; secondary has `--shadow-xs`.
- Focus: `.btn`, `.nav-item`, `.segmented-option`, `.mode-switch-option`, `.card-interactive`
  animate a 2px accent outline. Fields keep the border + `--focus-ring` glow. Never remove a focus
  style without a replacement.
- `.card-interactive` (or `<Panel interactive>`): hover = `--border-strong` + `--shadow-sm` +
  `translateY(-1px)` (hover-capable pointers only); active = `scale(0.99)`. The admin `.kind-card`
  follows the same pattern (accent only on focus).
- Segmented controls: sliding thumb via `<Segmented>`; raw `.segmented` markup keeps the per-option
  background (fine, but prefer the primitive).
- Switch: thumb eases 220ms `--ease-in-out`. Progress fill: width 480ms `--ease-out`.
- Skeleton: flat block + faint moving sheen (`--dur-shimmer`); `PageSkeleton` fades in after
  `--delay-skeleton` (no flash on fast loads).
- Dropdown: `.menu-surface` enter/exit. Toasts: enter/exit, `useToast()` API unchanged.
- Shell: sidebar never moves; each pathname change replays `.page-enter` on the page stage (no
  remount, Suspense keeps showing the old page until the new chunk is ready); drawer slides in/out;
  active nav bar glides between items. Scroll resets instantly before paint on navigation. Content
  that mounts together with the stage entrance skips its own `.content-fade-in` (no double fade).
- Fixed overlays inside a page: while `.page-enter` runs (320ms) the stage has a transform, so it
  is the containing block for any `position: fixed` descendant. Portal page overlays to
  `document.body`, or open them only in response to user input after the entrance.
- Theme toggle: `toggleTheme()` cross-fades the window (View Transitions, 220ms) or swaps instantly;
  per-element transitions are suppressed during the swap. Nothing to do in areas.

## Do / don't

- Do give a list or grid its entrance once, on first render. Don't animate on every filter change.
- Do animate the thing that changed (the new row, the result panel). Don't animate the whole page
  for an in-page state change.
- Do match hover colour changes to `--dur-fast`. Don't add `transition: all`.
- Do keep new keyframes out of shared CSS unless two areas need them; reuse `cc-enter` / `cc-exit`
  by setting `--enter-y` / `--enter-scale` / `--exit-x` / `--exit-y` / `--exit-scale` on the element
  (set every one - they inherit).
- Don't use framer-motion (not in any bundle), `setTimeout`-driven opacity, or `will-change` left on.
