# Lore deployment and assistant implementation plan

> **For agentic workers:** Execute these tasks with superpowers:executing-plans or isolated parallel ownership; preserve the working library.

**Goal:** Finish the local repository before deployment: run DreamBusta under Academy's `/library/`, manage Ollama models in the editor UI and animate the assistant from its launcher.

**Architecture:** Vue router and API links share one configured mount prefix. Nginx strips that prefix only for the independent Node API; static files come from DreamBusta's build. Ollama remains an independent loopback systemd service; editor-only management uses its HTTP API.

**Tech stack:** Vue 3, Vite, Node 24, SQLite, Ollama, systemd, Nginx.

**Spec:** User instructions in the current chat: local repo first; temporary `academy.dreamdocs.ru/library/`, future `busta.dreamdocs.ru`; UI model management now; launcher morphs into chat, top-right close only.

## Constraints and review focus

- Never modify Academy source, server configuration or real library data during this preparation.
- Preserve standalone `/library/<slug>` URLs when the mount is empty.
- Files, search source links, PDF assets, widget previews and cookies must stay inside the configured mount.
- Ollama endpoints require an editor session and CSRF for mutations; no arbitrary host or shell commands.
- Model changes invalidate query vectors and stop old work before rebuilding the index.
- Chat keeps focus handling, mobile sizing, drag/resize and reduced-motion behavior.

## Task 1: mounted build and deployment instructions

- [x] Review and finish the existing path helper and mount changes.
- [x] Exercise catalogue, article links/reload, search, login, widget preview and PDF under `/library/` with a temporary library.
- [x] Add an isolated Nginx include and a Lore runbook covering Node 24, systemd, first editor, Ollama, backup and updates.

## Task 2: model management

- [x] Implement authenticated model status, pull progress/cancel, selection, AI toggle and RAM unload.
- [x] Persist selections and safely apply them to live search.
- [x] Add the editor interface and tests against a loopback Ollama fixture.

## Task 3: assistant motion

- [x] Animate the built-in and embedded floating assistant from the launcher.
- [x] Hide the launcher while open; close using the upper-right control and restore focus.
- [x] Check keyboard, mobile, inline embedding and reduced motion.

## Final verification

- [x] Run unit/HTTP, typecheck, build, browser suites and mounted-build checks.
- [x] Review staged paths and exclude data/credentials/generated output. Delivery is recorded by the subsequent Git commit and push to main.
