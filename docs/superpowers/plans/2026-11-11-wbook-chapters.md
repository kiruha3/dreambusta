# WBook Chapters Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; implement inline in the current workspace, preserving existing edits. Steps use checkbox tracking.

**Goal:** Native/automatic/custom chapter navigation inside WBook while retaining global reading progress.
**Architecture:** Optional paragraph-based chapter metadata travels through book import and the existing material API. A pure chapter utility resolves boundaries; a Vue control manages browser-local settings and emits paragraph selection. Reader slices the virtual context without renumbering tokens.
**Tech Stack:** Existing Vue 3 / TypeScript / Node 24 / JSZip / SQLite.
**Spec:** ../specs/2026-11-11-wbook-chapters-design.md

## Global Constraints
- Local 5173 only; no deploy, commit or private-library replacement.
- Preserve text, originals, URLs, textVersion and progress when enriching existing books.
- Display WBook; retain internal speed key. Keep Text separate.
- No new dependencies; custom marker is literal text, not executable regex.

## Review Focus
- EPUB navigation targets multiple anchors within one spine item; map to correct paragraph.
- Empty/removed paragraphs cannot shift stored chapter boundaries.
- Native TOC labels need not resemble chapter headings; prefer source boundaries.
- Chapter transitions and empty custom matches preserve the current global word.
- Large books and narrow screens remain usable; filtering does not render book text in full.

### Task 1: Chapter data and extraction
- [x] Add failing EPUB2/EPUB3 anchor tests to tests/import.test.ts; run before implementation.
- [x] Add lib/chapters.ts utilities and tests/chapters.test.ts for native preference, automatic markers, literal custom markers, intro ranges and invalid boundaries.
- [x] Extend BookDocument/Material with optional chapters. In lib/formats/xml.ts optionally collect anchors; lib/formats/archive.ts reads source TOC and maps targets in spine order. validateDocument remaps after normalization; server/processing.ts preserves metadata.
- [x] Run targeted chapter/import/processing tests.

### Task 2: WBook chapter controls
- [x] Add failing isolated E2E for WBook label, chapter-only context, navigation, custom preview/no matches, reload and full-text continuity.
- [x] Create src/components/ChapterControls.vue; emit chapter set/enabled and paragraph selection. Persist settings by material/version; searchable TOC and bounded preview.
- [x] Adapt Reader.vue to global chapter ranges, slice context with original token indices, and stop at chapter boundary. Pass metadata from Material.vue; rename visible mode in api.ts, keeping speed key.
- [x] Run E2E and inspect phone layout.

### Task 3: Existing library and verification
- [x] Safely enrich local EPUB records from originals only if extracted paragraphs match; row backup and revision check, no textVersion increment.
- [x] Run npm test, npm run typecheck, npm run build, npm run test:e2e and git diff --check.
- [x] Verify the real 1200-chapter EPUB in browser, save proof, document behavior/limits and report local URL.
