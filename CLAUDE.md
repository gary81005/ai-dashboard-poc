# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server with HMR
npm run build    # tsc -b (project references) then vite build
npm run lint     # eslint .
npm run preview  # serve the production build from dist/
```

There is no test runner configured. `npm run build` and `npm run lint` are the only verification available — run both before claiming a change is done, since `tsc -b` catches things ESLint does not (the lint config is _not_ type-aware: it uses `tseslint.configs.recommended`, not `recommendedTypeChecked`).

## Current state

The app is still the unmodified Vite starter: `src/App.tsx` renders the template landing page (counter + Vite/React links), `src/main.tsx` mounts it under `StrictMode`. Despite the repo name there is no dashboard, routing, state management, data layer, or API client yet — any of those are greenfield decisions, not existing conventions to follow.

## Toolchain constraints

These are enforced by config and will fail the build, not just warn:

- **React Compiler is on.** `vite.config.ts` wires it through `@rolldown/plugin-babel` with `reactCompilerPreset()` from `@vitejs/plugin-react`. Consequences: don't hand-write `useMemo`/`useCallback`/`React.memo` for performance — the compiler does it. Code must obey the Rules of React (no mutating props/state, no conditional hooks) or the compiler silently bails out on that component. It also makes dev and build measurably slower; that's expected.
- **`verbatimModuleSyntax`** — type-only imports must be written `import type { Foo } from '...'`.
- **`erasableSyntaxOnly`** — no `enum`, no constructor parameter properties, no namespaces. Use union types / `as const` objects instead.
- **`noUnusedLocals` / `noUnusedParameters`** — an unused variable breaks `npm run build`.
- **`allowImportingTsExtensions`** — the existing code imports with extensions (`./App.tsx`); match that.

## TypeScript project references

`tsconfig.json` is a solution file with two real projects:

- `tsconfig.app.json` → `include: ["src"]`, DOM libs, `types: ["vite/client"]`
- `tsconfig.node.json` → `include: ["vite.config.ts"]`, Node types, no DOM

A new build-time/config file at the repo root (e.g. a Vitest or Tailwind config) must be added to `tsconfig.node.json`'s `include` or `tsc -b` will not see it.

## Assets

- `src/assets/*` — imported as modules, hashed by Vite.
- `public/icons.svg` — an SVG sprite. Icons are referenced as `<svg><use href="/icons.svg#github-icon" /></svg>` with `aria-hidden="true"`; add new symbols there rather than inlining paths.
- `src/index.css` defines the theme as CSS custom properties on `:root` with a `@media (prefers-color-scheme: dark)` override block. Add colors as variables in both blocks, not as literals in component CSS.
