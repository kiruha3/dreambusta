import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createPaths } from "../shared/paths.ts";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command}: exit ${result.status ?? result.signal}`);
}
function npm(script) {
  const cli = [
    process.env.npm_execpath,
    join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    resolve(
      dirname(process.execPath),
      "../lib/node_modules/npm/bin/npm-cli.js",
    ),
  ].find((path) => path && existsSync(path));
  if (!cli)
    throw new Error(
      "Запустите через npm run или добавьте Node 24 с npm в PATH.",
    );
  run(process.execPath, [cli, "run", script]);
}
function pack() {
  const paths = [
    "dist",
    "server",
    "shared",
    "lib",
    "vendor",
    "deploy/dreambusta",
    "scripts/tasks.mjs",
    "docs/operations.md",
    "docs/deploy-lore.md",
    "README.md",
    "Makefile",
    "package.json",
    "package-lock.json",
  ];
  for (const path of ["dist/index.html", ...paths]) {
    if (!existsSync(path))
      throw new Error(
        `Нет ${path}. Сначала выполните npm run build в каталоге проекта.`,
      );
  }
  // Explicit runtime allowlist: never archive the checkout or its private data.
  mkdirSync("outputs", { recursive: true });
  const id =
    new Date().toISOString().replace(/[-:.]/g, "") +
    "-" +
    randomUUID().slice(0, 8);
  const archive = resolve("outputs", `dreambusta-${id}.tgz`);
  run("tar", ["-czf", archive, "--", ...paths]);
  const sha = createHash("sha256").update(readFileSync(archive)).digest("hex");
  writeFileSync(
    archive + ".sha256",
    `${sha}  ${archive.split(/[\\/]/).at(-1)}\n`,
  );
  console.log(
    `Релиз: ${archive}\nSHA-256: ${sha}\nДанные библиотеки не включены; на сервер ничего не отправлено.`,
  );
}
async function doctor() {
  const paths = createPaths(process.env.DREAMBUSTA_BASE_PATH);
  const checks = [
    [
      "Интерфейс",
      `http://127.0.0.1:${process.env.WEB_PORT || 5173}${paths.public(paths.catalog)}`,
    ],
    ["API", `http://127.0.0.1:${process.env.API_PORT || 5176}/api/session`],
    [
      "Поиск",
      `http://127.0.0.1:${process.env.API_PORT || 5176}/api/search?q=DreamDocs&limit=1`,
    ],
  ];
  if (process.env.DREAMBUSTA_AI !== "off")
    checks.push([
      "Ollama",
      `${process.env.DREAMBUSTA_OLLAMA_URL || "http://127.0.0.1:11434"}/api/tags`,
    ]);
  for (const [name, url] of checks) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const body =
        name === "Интерфейс" ? await response.text() : await response.json();
      if (response.status === 401 && name === "Поиск") {
        console.log(
          `${name}: закрытая библиотека, проверьте поиск после входа`,
        );
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (name === "Ollama") {
        const available = new Set(body.models?.map((model) => model.name));
        const missing = [
          process.env.DREAMBUSTA_EMBED_MODEL || "embeddinggemma:latest",
          process.env.DREAMBUSTA_ANSWER_MODEL || "gemma4:e2b",
        ].filter(
          (model) =>
            !available.has(model.includes(":") ? model : model + ":latest"),
        );
        if (missing.length)
          throw new Error(`скачайте модели: ${missing.join(", ")}`);
      }
      console.log(
        `${name}: OK${name === "Поиск" ? ` (${body.mode}, indexing=${body.indexing})` : ""}`,
      );
    } catch (error) {
      console.error(`${name}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

try {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error("Нужен Node.js 24+.");
  const command = process.argv[2] || "help";
  if (command === "build-library") {
    process.env.DREAMBUSTA_BASE_PATH = "/library";
    npm("build");
  } else if (command === "check") {
    for (const script of ["test", "typecheck", "build"]) npm(script);
  } else if (command === "verify" || command === "release") {
    npm("check");
    npm("test:e2e");
    if (command === "release") pack();
  } else if (command === "pack") pack();
  else if (command === "doctor") await doctor();
  else if (
    ["server-status", "server-logs", "server-restart", "backup"].includes(
      command,
    )
  ) {
    if (process.platform !== "linux")
      throw new Error(
        "Команда предназначена для Linux-сервера. На Windows используйте dev/doctor/check/release.",
      );
    const args = [
      "bash",
      "deploy/dreambusta/service.sh",
      command.replace("server-", ""),
    ];
    if (process.getuid() === 0) run(args[0], args.slice(1));
    else run("sudo", args);
  } else if (command === "help") {
    console.log(`DreamBusta — Node 24+, команды из каталога проекта:
  npm run dev          запуск API + Vite; Ctrl+C — остановка
  npm run build:library сборка для academy.dreamdocs.ru/library/
  npm run doctor       доступность интерфейса, API, поиска, моделей
  npm run check        unit/HTTP + typecheck + build
  npm run verify       check + браузерные E2E
  npm run release      verify + архив релиза и SHA-256 в outputs/
  npm run release:pack только упаковка уже собранного dist/
  npm run test:search:live  отдельная проверка настоящих моделей
Linux-сервер (systemd, sudo):
  npm run server:status / server:logs / server:restart / backup
Все эти команды доступны также через make help.`);
  } else throw new Error(`Неизвестная команда: ${command}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
