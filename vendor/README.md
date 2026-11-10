# Reused project components

- `docx-editor/src/`: snapshot of `E:/DA/DA/techhelper/frontend_docx_editor/src`, 2026-11-11. Used as a React 18 read-only viewer hosted by Vue. Internal `@/lib/utils` alias changed to `@docx/lib/utils`. No dependency on the original checkout at runtime.
- `presentation-pptx/` and `shared/presentation.ts`: snapshot of DreamAgent Desktop's OOXML parser and neutral scene types, 2026-11-11. Node imports made explicit with `.ts`; constants copied locally. Electron, IPC and the editor are not used. The library uses only `read.ts` and its dependencies. Original source/write modules retained for provenance.

Changes to shared components should be reviewed against their original projects. Do not copy their environment files, data or credentials.
