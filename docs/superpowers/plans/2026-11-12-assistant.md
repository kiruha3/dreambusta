# Assistant Widget Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. User requested continuous implementation; keep top search.

**Goal:** Dedicated question/answer widget using existing grounded library API.
**Architecture:** TechHelper widget shell adapted to a local modeless Vue panel with in-memory turns and existing DreamBusta API; search remains independently available.
**Tech Stack:** Existing Vue 3, lucide, browser fetch; no new dependencies.
**Spec:** docs/superpowers/specs/2026-11-12-assistant-design.md

## Global Constraints
- Only DreamBusta; preserve library and top search / Ctrl+K; no deployment.
- No stored chat or implicit conversational memory; independent questions, explicit UI copy.
- Existing server authorizes all retrieval/generation and exact source URLs.

## Review Focus
- Cancel/reopen, retries, repeated handoff and late responses.
- Scope captured per question; access changes clear private history.
- Mobile viewport, focus/keyboard, safe text rendering.

### Task 1: Widget and search handoff
Files: src/components/AssistantWidget.vue, src/composables/assistant.ts,
src/components/SearchDialog.vue, src/App.vue,
src/components/assistant/ChatWidgetShell.vue; tests/search-e2e.mjs.
- [x] Update E2E: top search stays, search hands question to assistant, response and source open; direct question, retained history/new dialog, scope and mobile.
- [x] Run E2E and observe missing widget failure.
- [x] Implement shared handoff, widget/API lifecycle, safe scoped turns and search handoff.
- [x] Pass search E2E, full tests/typecheck/build/general E2E; document behavior.
