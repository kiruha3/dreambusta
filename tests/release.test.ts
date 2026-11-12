import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const cli = fileURLToPath(new URL("../scripts/tasks.mjs", import.meta.url));
function fixture(t: any) {
  const root = mkdtempSync(join(tmpdir(), "dreambusta-release-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [
    "dist/index.html",
    "server/index.ts",
    "shared/types.ts",
    "lib/books.ts",
    "vendor/README.md",
    "deploy/dreambusta/dreambusta.service",
    "scripts/tasks.mjs",
    "docs/operations.md",
    "docs/deploy-lore.md",
    "README.md",
    "package.json",
    "package-lock.json",
    "Makefile",
    "data/library.sqlite",
    ".env",
    ".git/config",
    "node_modules/private.txt",
  ]) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), file);
  }
  return root;
}

test("release archive includes runtime and operations but excludes private library and credentials", (t) => {
  const root = fixture(t);
  const result = spawnSync(process.execPath, [cli, "pack"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const archive = readdirSync(join(root, "outputs")).find((name) =>
    name.endsWith(".tgz"),
  );
  assert.ok(archive, "pack must create a release archive");
  const archivePath = join(root, "outputs", archive);
  const listing = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
  assert.equal(listing.status, 0, listing.stderr);
  assert.match(listing.stdout, /dist\/index.html/);
  assert.match(listing.stdout, /deploy\/dreambusta\/dreambusta.service/);
  assert.match(listing.stdout, /scripts\/tasks.mjs/);
  assert.match(listing.stdout, /docs\/deploy-lore.md/);
  assert.doesNotMatch(
    listing.stdout,
    /(?:^|\n)(?:data\/|\.env|\.git\/|node_modules\/)/,
  );
  assert.ok(
    readFileSync(archivePath + ".sha256", "utf8").startsWith(
      createHash("sha256").update(readFileSync(archivePath)).digest("hex"),
    ),
  );
  assert.equal(
    readFileSync(join(root, "data/library.sqlite"), "utf8"),
    "data/library.sqlite",
  );
});

test("pack refuses missing build output before creating an archive", (t) => {
  const root = fixture(t);
  rmSync(join(root, "dist/index.html"));
  const result = spawnSync(process.execPath, [cli, "pack"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /dist\/index.html/);
  assert.ok(!readdirSync(root).includes("outputs"));
});

test("release stops before E2E and packaging when mandatory checks fail", (t) => {
  const root = fixture(t);
  const fakeNpm = join(root, "npm-cli.mjs");
  writeFileSync(
    fakeNpm,
    `import {appendFileSync} from 'node:fs';
appendFileSync('calls.txt', process.argv.slice(2).join(' ') + '\\n');
process.exit(7);
`,
  );
  const result = spawnSync(process.execPath, [cli, "release"], {
    cwd: root,
    env: { ...process.env, npm_execpath: fakeNpm },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /exit 7/);
  assert.equal(readFileSync(join(root, "calls.txt"), "utf8"), "run check\n");
  assert.ok(!readdirSync(root).includes("outputs"));
});
