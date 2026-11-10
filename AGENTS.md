# WBook repository instructions

- Run WBook locally only, bound to `0.0.0.0` for phone testing on the local network.
- Do not publish, deploy, or synchronize the running application to external hosting unless the user explicitly requests hosting again. Pushing source to GitHub does not authorize application hosting.
- On 2026-11-10 the user explicitly authorized deployment to their VPS at `45.9.12.136`. Keep the VPS library separate from local `.wrangler/state`; do not restore the retired Sites deployment.
- Source repository: `https://github.com/kiruha3/Wbook.git`.
- Preserve the local library and its files in `.wrangler/state`. Do not commit local library data, environment files, generated outputs, or credentials.
- Start from the repository directory with `npm run dev -- --hostname 0.0.0.0 --port 5173`.
- The previous cloud application was retired to HTTP 410 in a separate checkout under ignored outputs. Do not pull that retirement source into the local application.

# Current DreamBusta workspace (supersedes historical WBook launch notes above)

- This folder is an independent nested Git repository on feat/vue-library, no remote. Do not turn it into a parent-repository gitlink/submodule.
- Active app: Vue 3 in src/, Node 24 API in server/, SQLite/files in ignored data/. Historical React/Cloudflare sources are inactive and preserved by baseline b5fb240.
- Local launch: npm run dev, frontend 5175 and API 5176. No deployment is authorized for DreamBusta. Do not reuse any Academy credentials.
- Preserve the original WBook checkout and its private library. Do not commit data/, .env, generated design exports, browser artifacts or node_modules.
- Run npm test, npm run typecheck, npm run build and npm run test:e2e for relevant app changes. E2E uses its own temporary database; never seed test credentials into working data/.
- Share snapshots are opened without fetching the source. A failed manual refresh retains the last good snapshot; only explicit finish-unavailable revokes it.
- New user-facing URLs use stable human-readable slugs; historical aliases remain reserved forever. Internal material IDs are separate.
