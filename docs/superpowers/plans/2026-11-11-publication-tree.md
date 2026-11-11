# Publication tree implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Import a selected public article, branch or menu and navigate its saved hierarchy locally.
**Architecture:** Retain Material.pages and atomic refresh. Add source import options, public navigation discovery and parent metadata, with one recursive Vue navigation component shared by import selection and reading.
**Tech Stack:** Existing Vue 3, TypeScript, Node 24, SQLite, public HTTP source adapters.
**Spec:** ../specs/2026-11-11-publication-tree-design.md

## Global Constraints
- Existing nested repository and local ports 5175/5176. Preserve working data and prior edits; no deployment.
- Default scope `branch`; supported scopes `article`, `branch`, `menu`. Menu selection is explicit and validated against public navigation.
- 100 pages / 100 MB. Stable human-readable page slugs and reserved historical addresses.
- Reading never fetches the source; manual refresh commits a complete version or retains the previous one.

## Review Focus
- Unrelated Buildin workspace blocks must not enter a selected branch.
- Forged menu selections cannot cause fetching arbitrary URLs.
- Cycles, repeated references and duplicate titles must preserve a bounded navigable tree.
- A failed descendant fetch must retain the complete previous snapshot and import options.
- Mobile tree, keyboard navigation, current page and mode switching must remain usable.

### Task 1: Public navigation and import scopes
**Files:** shared/types.ts, server/shares.ts, server/sources/buildin.ts (new), server/app.ts, tests/shares.test.ts, tests/publication-tree.test.ts (new).
**Interfaces:** `ShareImportOptions { scope: 'article'|'branch'|'menu'; selectedUrls?: string[] }`; `PublicationNode { sourceUrl; parentSourceUrl?; title }`; `Shares.navigation(url): Promise<PublicationNode[]>`; `Shares.add(url,title?,options?)`; source.importOptions; Material.navigation; PublicationPage.parentSourceUrl.
- [x] Add failing fixture tests for Buildin branch boundaries, nested parent links, article-only scope, menu selection/validation, cycles, atomic refresh and saved options.
- [x] Run the new tests and observe expected failures.
- [x] Implement anonymous provider navigation and bounded selected-page fetching; reuse shared snapshot sanitization/assets and stable slug reservations.
- [x] Validate API options and expose POST /links/navigation for editor-only metadata preview.
- [x] Run all unit/HTTP tests; record results in the implementation ledger.

### Task 2: Import controls and reading tree
**Files:** src/pages/AddMaterial.vue, src/pages/Material.vue, src/components/PublicationTree.vue (new), src/style.css, tests/e2e.mjs.
**Interfaces:** Import controls submit Task 1 options; reader consumes Material.navigation/pages and existing `?page=slug` URLs.
- [x] Add browser regressions for default scope, menu checkboxes, nested tree transitions/back links, separate modes, mobile tree and manual refresh controls; reproduce missing behavior.
- [x] Implement controls, public tree selection, accessible recursive reader tree, current-page highlight and a single editor refresh button.
- [x] Run E2E against a temporary database and inspect desktop/mobile screenshots.

### Task 3: Verify real example and handoff
**Files:** tests/live-sources.mjs, README.md, docs/implementation-status.md.
- [x] Verify the actual public Buildin example anonymously with branch boundaries and source links.
- [x] Run npm test, npm run typecheck, npm run build, npm run test:e2e using bundled Node 24.
- [x] Perform one independent read-only review as required by executing-plans; fix substantive findings and recheck relevant tests.
- [x] Refresh the existing local Buildin material to the default branch scope and show the finished navigation.
- [x] Document final behavior and limitations; keep changes reviewable locally without mixing unrelated previous edits into a commit.

## Execution ruling
The user has approved the design in conversation and requested implementation. Execute directly in this session without another approval round; existing repository path and ongoing uncommitted edits are intentionally preserved. No implementation subagents; one final review only.
