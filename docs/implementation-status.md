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

- Task 1: complete — persistent store + auth/CSRF/visibility; 17/17 targeted tests. Commit e264867.
- Task 2: complete — streamed uploads, preserved originals, MD/TXT/WBook/PDF, media Range, DOC converter adapter and native PPTX parser; full suite 35/35 PASS.
- Ruling: PPTX uses the actual DreamAgent Desktop parser and static Vue scene renderer because LibreOffice is absent. Warn about unsupported objects/animation. Original retained; DOC requires installed converter. This enables local slide viewing now with less fidelity for complex decks than Office PDF conversion.
- Ruling: TechHelper DOCX source is vendored as an isolated React 18 readOnly island in Vue. Standalone builds do not depend on E:/DA paths.
- Task 3: complete — bounded public HTTP adapter with DNS pinning/redirect validation, Buildin main-article block extraction, TechHelper published JSON, raster snapshot resources and manual refresh/revocation policy. 3 source unit tests + live anonymous Buildin example PASS.
- Vue catalogue/collections/editor forms/viewers/reader use real persistent API; no demo materials in working data directory.
- Browser finding: Vite string proxy shorthand changes Host. Replaced with explicit changeOrigin:false; origin/CSRF protection remains enabled.
- Regression: DOCX empty text must retain visual representation; processor uses raw WBook DOCX extractor without book text validation. Office tests PASS.
- Task 4: complete — actual Vue catalogue, collections, protected editor, uploads/link/article forms, metadata/visibility/cover/settings and source management; browser CRUD workflow PASS.
- Task 5: complete — PDF worker/canvas, TechHelper React readOnly Word, static native slides, media, WBook focus/hold/keys/virtual text/word selection/local progress; browser PDF scan/Word table/ordered PPTX/large book/WAV PASS.
- Task 6: complete — 48/48 unit/HTTP tests, vue-tsc and Vite production build PASS. Browser workflow and anonymous Buildin smoke PASS. Independent review findings fixed and verified below.
- Security regression: delayed setup body previously allowed a second first editor; reproduced with a held HTTP request, fixed by transactional recheck. Vite supplies actual client address so LAN clients cannot bootstrap via loopback proxy. Origin checking retained.
- Ruling: legacy WBook data/URLs/progress are not migrated because the copied project intentionally contains no personal library. Historical sources remain in baseline. A separate migration would be needed to preserve old installations' URLs.
- Ruling: initial TechHelper native documents use saved article structure (including tables); published PDF previews are stored separately. No private original URL is fetched. Exact rich editor fidelity and SSO require further integration against real sample shares.

## Final review and verification

- Independent read-only review of b5fb240..326f1ab returned five actionable findings. All five accepted on actual impact; no Critical/Important finding deferred. One fix pass, no second review loop.
- P1: Vite exposed private data through static URLs. A failing HTTP test reproduced anonymous 200 for the database. Storage is now denied, including custom DATA_DIR and /@fs/ URLs. Configuration under public assets/build output or containing the source root is rejected. Regression tests PASS.
- P1: delayed refresh could restore an explicitly revoked publication or overwrite a replacement. Failing tests reproduced restoration and concurrent texts sharing one version. Store revisions now reject stale commits with HTTP 409, also covering uploads, cover and transcript updates. Tests PASS.
- P1: preview/image failures could discard part of a saved publication. A failing test reproduced PDF loss; refresh now commits the complete new snapshot or preserves the complete prior one. PDF and image failure/recovery tests PASS.
- P2: PDF/slides lost visual positions across modes. Browser regression reproduced the reset. Page/slide and zoom are stored per material/content version; reopening restores them, out-of-range positions clamp and a new version has separate progress. Browser checks PASS.
- P2: substantial decks lacked navigation/zoom. Added direct page input, thumbnails, zoom with internal scrolling and fullscreen. A failing browser check preceded the implementation; a dense 20-slide deck on 390px screen now passes all controls and overflow checks. Final mobile screenshot inspected.
- Acceptance closure: streamed SHA-256 detects identical uploaded files; normalized source URLs detect repeated links. Re-import returns a useful conflict pointing to the existing card. Failing HTTP/source tests preceded the fix; tests PASS. Store checks also cover concurrent imports.
- Final verification: 48/48 tests; vue-tsc --noEmit; Vite build; isolated Playwright E2E; live anonymous Buildin — PASS. DOC conversion was not tested because LibreOffice is absent. Real TechHelper rich-document/SSO compatibility and remote video playback remain integration checks, not claimed verified.
- Minor build warning retained: lazily loaded readOnly Word viewer is about 988 kB minified / 295 kB gzip. Static PPTX fidelity limits remain documented. No unrelated speculative changes or extra review rounds.
- Completion ruling: keep feat/vue-library in the explicitly requested nested repository with no remote. No merge, push, submodule registration or deployment. The user already chose this handoff arrangement; no additional finishing menu is needed.
