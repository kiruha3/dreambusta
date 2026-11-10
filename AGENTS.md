# WBook repository instructions

- Run WBook locally only, bound to `0.0.0.0` for phone testing on the local network.
- Do not publish, deploy, or synchronize the running application to external hosting unless the user explicitly requests hosting again. Pushing source to GitHub does not authorize application hosting.
- On 2026-11-10 the user explicitly authorized deployment to their VPS at `45.9.12.136`. Keep the VPS library separate from local `.wrangler/state`; do not restore the retired Sites deployment.
- Source repository: `https://github.com/kiruha3/Wbook.git`.
- Preserve the local library and its files in `.wrangler/state`. Do not commit local library data, environment files, generated outputs, or credentials.
- Start from the repository directory with `npm run dev -- --hostname 0.0.0.0 --port 5173`.
- The previous cloud application was retired to HTTP 410 in a separate checkout under ignored outputs. Do not pull that retirement source into the local application.
