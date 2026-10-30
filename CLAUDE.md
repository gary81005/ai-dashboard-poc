# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server with HMR
npm run build    # tsc -b (project references) then vite build
npm run lint     # eslint .
npm test         # vitest run — tests/ (pure utils + Excel parsing)
npm run preview  # serve the production build from dist/
npm run db:push  # apply supabase/migrations/ to the linked Supabase project
npm run db:types # regenerate src/types/database.ts from the linked project's schema
```

Run `npm run build`, `npm run lint` and `npm test` before claiming a change is done. `tsc -b` catches things ESLint does not (the lint config is _not_ type-aware: it uses `tseslint.configs.recommended`, not `recommendedTypeChecked`). Vitest (ADR 0010 §8) covers only pure logic — `src/utils/` and `services/parseWorkbook.ts` — in a Node environment; React components are not tested. Tests live in `tests/`; `tests/workbooks.ts` loads `public/samples/` plus the three simulated workbooks in `tests/fixtures/` (all simulated data, safe to commit).

## Product & design docs

A personal dashboard builder: upload a standardized Excel workbook, drag columns onto chart slots, arrange widgets on a grid. There is no backend of our own: the browser talks to Supabase (Auth, Postgres, Storage) directly. Read these before changing behavior:

- `CONTEXT.md` — domain glossary (Dataset, DataTable, Field, FieldRef, Widget, encoding slots, ratio fields…). Use these names in code. UI text does not: its 畫面用語 table maps each term to the plain wording shown to users (維度／量值 → 分類／數值, 槽位 → 放置區, 非加權平均 → 直接平均…); follow it when writing UI strings.
- `docs/adr/` — decisions 0001–0012: frontend-only storage (localStorage config + IndexedDB rows), ExcelJS parsing, field identity/rebinding, role & aggregation rules, the persisted JSON schema v1, the library stack, the move to Supabase storage (0007, superseding 0001), and schema v2 (0008: dashboard filters whose selected values live only in `uiStore`, weighted ratios via `Field.ratioOf` detected from `numerator/denominator` formulas, thresholds, sort/top-N, table totals, `description`, the `text` widget), and responsive layout (0009: below a 900px-wide grid the saved 12-column layout is reflowed to 2 or 1 columns by `utils/responsiveLayout.ts` and never written back; editing requires the `lg` breakpoint), and the chart recommendation rules (0010: field kinds, table kinds, the combination table shared by recommendations, warnings and one-click dashboards — computed at runtime, no schema change), and value labels (0011, schema v3: `Field.valueLabels` maps raw values to display text — display only; grouping, sorting and filtering keep raw `categoryKey` values, and only query outputs/formatters swap in labels via `utils/valueLabels.ts`. 0/1 columns are auto-labelled 是/否 at parse time and TRUE/FALSE cells become 1/0; binary measures format as 「是 35%」/「是 120 筆」. Users switch back to raw values per field (`showValueLabels: false`) or per widget (`Widget.rawValues`, applied by `withRawValues` before querying), and share links (0012, being implemented in stages: anyone with the link can view without logging in, but only gets precomputed widget results — never raw rows; `computeWidget` results are written to `dashboard_shares.snapshot` in the same transaction as the dashboard save, read by `anon` only through the `security definer` RPC `get_shared_dashboard`). 0007 is implemented: after magic-link login, datasets, rows, source files and dashboards all live in Supabase; nothing app-level is stored in the browser any more. Dashboard content edits are kept in memory until the user presses 儲存 (see `appStore.draftBase`). Read 0005 before changing anything that is persisted.
- `public/samples/` — the sample standardized workbook loaded by the "載入範例資料" button.

Two dependencies are unmaintained — `exceljs` and `react-dnd` — so don't upgrade-hunt them. `exceljs` is ~930 KB minified: load it only via dynamic `import('exceljs')` (see `services/parseWorkbook.ts`), never a static import.

## Source layout

- `src/types/` — the persisted config shape (source of truth for ADR 0005). Changing a field's meaning requires bumping `SCHEMA_VERSION` and a conversion step in `utils/schema.ts` (`migrateRecord`), which runs on every record read from Supabase.
- `src/utils/` — pure logic, no React: field matching (`fields.ts`), role/ratio inference, the aggregation engine (`query.ts`), number formatting.
- `src/services/` — I/O: the Supabase client, auth, Excel parsing, `dataset_rows` and Storage access, dataset load/import/edit/delete, sample loading. UI never imports the Supabase client directly.
- `src/store/` — Zustand stores. None are persisted. `appStore` is the in-memory copy of the user's datasets and dashboards, plus `draftBase` (the last-saved version of the open dashboard; non-null means unsaved changes); `rowsStore` caches rows fetched from Supabase; `authStore` mirrors the Supabase session; `uiStore` holds navigation (there is no router — `navigate`/`leave` prompt before leaving unsaved changes) and the global Snackbar notice.
- `src/constants/` — sample dashboard fixture, the per-type slot catalogue (`widgetTypes.ts`, drives the editor), the drag type.
- `src/components/` — `widgets/` (one renderer per widget type), `editor/` (field panel, drop slots, widget settings — edit mode), `dashboard/` (grid, rebind dialog), `dashboards/` (list cards, create/import dialogs), `datasets/`. `src/pages/` has one component per screen; `src/hooks/` holds `useDatasetRows`.

Widget components only draw: `utils/computeWidget.ts` turns a widget + `QueryContext` into a JSON-serializable `WidgetResult` (data, or a message for incomplete setup / no data / errors), and `WidgetBody` dispatches it to the renderer. Queries run through `utils/runQuery.ts` inside it, so a `MissingFieldError` becomes a "欄位遺失" message instead of a crash. Keep results plain JSON — share links store them (ADR 0012).

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
- `tsconfig.node.json` → `include: ["vite.config.ts", "vitest.config.ts"]`, Node types, no DOM
- `tsconfig.test.json` → `include: ["tests"]`, Node types (tests read fixture files with `node:fs`); the `src` files they import are type-checked here too

A new build-time/config file at the repo root (e.g. a Vitest or Tailwind config) must be added to `tsconfig.node.json`'s `include` or `tsc -b` will not see it.

## Assets

- Colors come from the MUI theme in `src/theme.ts` (`cssVariables: true`, light/dark `colorSchemes` following the OS). Use theme tokens (`color='text.secondary'`, `bgcolor: 'background.paper'`), not color literals. The palette follows the Clinico brand (primary = brand yellow `#fabe00` with dark contrast text): for text in the primary colour use `color='text.accent'`, never `primary.main` — yellow text on white is unreadable. `theme.ts` already redirects text/outlined buttons, focused labels, tabs and toggle buttons to it. Dimension field chips are `info` (blue), measures `success` (green). Two custom palette groups: `chart.s1`–`s8` (chart series colours, applied to every chart through `MuiChartsDataProvider.defaultProps.colors` as CSS variables — don't pass `colors` per chart) and `header` (the AppBar's dark gradient, text and yellow accent). `src/index.css` holds only global base rules.
- `public/icons.svg` — an SVG sprite. Icons are referenced as `<svg><use href="/icons.svg#github-icon" /></svg>` with `aria-hidden="true"`; add new symbols there rather than inlining paths.
