# DreamBusta implementation ledger

Plan: docs/superpowers/plans/2026-11-11-dreambusta-vue.md

- Baseline b5fb240: imported WBook and design sources preserved in the explicitly requested nested repository. No remote.
- Work branch: feat/vue-library. User authorized implementation after reviewing mockups and choosing Vue.
- Baseline verification: 12 reader/library/API utility tests PASS.
- Pre-flight: Task 1 Store/Material interfaces are consumed by uploads, shares and Vue API. All use stable IDs internally and slugs externally. Representations and source remain separate.
- Pre-flight: WBook rejects empty text; Task 2 must bypass that validation for visual-only PDF/slides/media while preserving book importer behavior.
- Ruling: execute in the explicitly requested nested repository, no additional worktree. This keeps the user's requested path intact; local baseline commit protects the imported state.
- Ruling: Node 24 + SQLite/filesystem for the initial independent local server. Cloudflare-specific routes remain historical source, not the active Vue backend. Production storage remains a separate deployment decision.
- Ruling: Vue frontend uses port 5175 and API 5176 to avoid disturbing the existing reader and mockup gallery. The dev server binds 0.0.0.0 for phone testing.

## Progress

- Task 1: in progress — tests written before implementation.
- Task 2–6: pending.

- Task 1: complete — persistent store + auth/CSRF/visibility; 17/17 targeted tests. Commit e264867.
- Task 2: complete — streamed uploads, preserved originals, MD/TXT/WBook/PDF, media Range, DOC converter adapter and native PPTX parser; full suite 35/35 PASS.
- Ruling: PPTX uses the actual DreamAgent Desktop parser and static Vue scene renderer because LibreOffice is absent. Warn about unsupported objects/animation. Original retained; DOC requires installed converter. This enables local slide viewing now with less fidelity for complex decks than Office PDF conversion.
- Ruling: TechHelper DOCX source is vendored as an isolated React 18 readOnly island in Vue. Standalone builds do not depend on E:/DA paths.
- Task 3: complete — bounded public HTTP adapter with DNS pinning/redirect validation, Buildin main-article block extraction, TechHelper published JSON, raster snapshot resources and manual refresh/revocation policy. 3 source unit tests + live anonymous Buildin example PASS.
- Task 4–5: implemented, browser verification in progress. Vue catalogue/collections/editor forms/viewers/reader use real persistent API; no demo materials in working data directory.
- Browser finding: Vite string proxy shorthand changes Host. Replaced with explicit changeOrigin:false; origin/CSRF protection remains enabled.
- Regression: DOCX empty text must retain visual representation; processor uses raw WBook DOCX extractor without book text validation. Office tests PASS.
