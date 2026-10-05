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

## Product & design docs

A personal dashboard builder: upload a standardized Excel workbook, drag columns onto chart slots, arrange widgets on a grid. Frontend only. Read these before changing behavior:

- `CONTEXT.md` — domain glossary (Dataset, DataTable, Field, FieldRef, Widget, encoding slots, ratio fields…). Use these names in code.
- `docs/adr/` — decisions 0001–0006: frontend-only storage (localStorage config + IndexedDB rows), ExcelJS parsing, field identity/rebinding, role & aggregation rules, the persisted JSON schema v1, and the library stack. Read 0005 before changing anything that is persisted.
- `public/samples/` — the sample standardized workbook loaded by the "載入範例資料" button.

Two dependencies are unmaintained — `exceljs` and `react-dnd` — so don't upgrade-hunt them. `exceljs` is ~930 KB minified: load it only via dynamic `import('exceljs')` (see `services/parseWorkbook.ts`), never a static import.

## Source layout

- `src/types/` — the persisted config shape (source of truth for ADR 0005). Changing a field's meaning requires bumping `SCHEMA_VERSION` and a `migrate` step in `store/appStore.ts`.
- `src/utils/` — pure logic, no React: field matching (`fields.ts`), role/ratio inference, the aggregation engine (`query.ts`), number formatting.
- `src/services/` — I/O: Excel parsing, IndexedDB rows, dataset import/delete, sample loading.
- `src/store/` — Zustand stores. `appStore` is the only persisted one (one localStorage key); `rowsStore` caches IndexedDB rows in memory; `uiStore` holds navigation (there is no router).
- `src/constants/` — sample dashboard fixture, the per-type slot catalogue (`widgetTypes.ts`, drives the editor), the drag type.
- `src/components/` — `widgets/` (one renderer per widget type), `editor/` (field panel, drop slots, widget settings — edit mode), `dashboard/` (grid, rebind dialog), `dashboards/` (list cards, create/import dialogs), `datasets/`. `src/pages/` has one component per screen; `src/hooks/` holds `useDatasetRows`.

Widget components must not throw during render: queries go through `utils/runQuery.ts`, which turns a `MissingFieldError` into a "欄位遺失" message instead of a crash.

MUI X chart axes use `height: 'auto'` / `width: 'auto'`. The fixed defaults (25px / 45px) are too small for CJK tick labels and MUI ellipsizes them to an empty string. Exception: an x-axis with a `label` needs a fixed height, because auto-sizing ignores the title.

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

- Colors come from the MUI theme in `src/theme.ts` (`cssVariables: true`, light/dark `colorSchemes` following the OS). Use theme tokens (`color='text.secondary'`, `bgcolor: 'background.paper'`), not color literals. `src/index.css` holds only global base rules.
- `public/icons.svg` — an SVG sprite. Icons are referenced as `<svg><use href="/icons.svg#github-icon" /></svg>` with `aria-hidden="true"`; add new symbols there rather than inlining paths.
