// Explicit network smoke; not part of the offline unit suite.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import { Shares } from "../server/shares.ts";
const dir = mkdtempSync(join(tmpdir(), "dreambusta-live-"));
const store = new Store(dir);
try {
  const material = await new Shares(store, dir).add(
    "https://buildin.ai/share/480fea3b-bf25-478c-8c33-111c002defdc",
  );
  assert.equal(material.title, "Buildin Developer Guide");
  assert.match(material.html, /Quick Start Guide/);
  assert.doesNotMatch(material.html, /Trash|Cookie|Workspace Settings/);
  assert.ok(material.wordCount > 10);
  assert.equal(material.source.importOptions.scope, "branch");
  assert.equal(material.icon?.type, "image");
  assert.match(material.icon.value, /^snapshot:icon-/);
  assert.ok(
    material.pages.some(
      (p) => p.icon?.type === "emoji" && p.icon.value === "🗂️",
    ),
  );
  assert.ok(
    material.pages.length >= 9,
    "published guide descendants are saved",
  );
  assert.equal(material.navigation.length, material.pages.length + 1);
  assert.ok(
    !material.pages.some(
      (p) => p.title === "Help center" || p.title === "Privacy Policy",
    ),
  );
  assert.ok(material.pages.every((p) => p.parentSourceUrl));
  const menu = await new Shares(store, dir).navigation(material.source.url);
  assert.ok(menu.some((n) => n.title === "Help center"));
  assert.ok(menu.some((n) => n.sourceUrl === material.source.url));
  console.log(
    `PASS: public Buildin branch (${material.pages.length + 1} pages), menu (${menu.length} pages), no account/session.`,
  );
} finally {
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
