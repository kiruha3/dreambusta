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
  console.log(
    "PASS: public Buildin snapshot, main article only, no account/session.",
  );
} finally {
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
