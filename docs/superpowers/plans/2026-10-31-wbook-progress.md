# SDD ledger — plan: docs/superpowers/plans/2026-10-31-wbook-reader.md

Execution: native in this session; user explicitly authorized implementation and host launch.
Workspace: E:\WBook\app is a new isolated application directory; E:\WBook initially had no Git repository or product files.
Pre-flight: interfaces reviewed in plan; no conflicts.
Ruling: use current approved workspace and native execution without an additional plan-approval round — user said «да делаем запускай на host» — the approved design is the product authority.

Task 1: complete — actual local D1/R2 POST/GET integration, second session, duplicate, invalid id passed.
Task 2: complete — real MOBI/AZW3 public-domain fixtures and generated TXT/FB2/EPUB/DOCX/PDF fixtures passed; no OCR.
Task 3: complete — reader/Unicode/gesture/delay/progress tests passed.
Task 4: complete — browser hold released at word6, drag upward speed300→375, mobile390px no horizontal overflow. Physical phone check pending user.
Task 5: in progress — independent code review, production publication and final URL verification.
Verification: npm test 18/18; npm run typecheck exit0; first production build exit0; later import correction requires final rebuild.


Final review: four findings verified and fixed: elapsed word timing during continuous speed changes; nonlinear EPUB notes; bounded actual ZIP output; visible row remeasurement on rotation. RED→GREEN tests cover clock/notes/ZIP; mobile browser rotation showed0 overlapping paragraphs.
User EPUB regression: XHTML self-closing title swallowed body in native HTML parser; XML-first extraction fixes it. Multipart request was blocked by1MiB framework default; next.config40MiB and readable non-JSON errors fix it. User book imported from browser:70,450words.
User refinement: fit word by measured rendered width around fixed focal letter, prohibit wrapping. Browser390px:longword30.3197px, both sides fit, focal offset0.008px; rotation844px:no overlapping rows.
Verification: npm test26/26 and typecheck exit0; both API integrations passed. Final source packaging and deployment pending.

