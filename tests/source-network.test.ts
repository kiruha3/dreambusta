import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import {
  validatePublicUrl,
  createSourceFetcher,
} from "../server/sources/network.ts";

test("an explicitly trusted TechHelper origin may resolve to the corporate private network", async (t) => {
  t.mock.method(dns, "lookup", async () => [
    { address: "10.172.65.101", family: 4 },
  ]);
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const trusted = new Set(["https://tracker.slsoft.ru"]);
  await assert.rejects(
    validatePublicUrl("https://tracker.slsoft.ru/api/shared/kb/article/"),
  );
  const resolved = await validatePublicUrl(
    "https://tracker.slsoft.ru/api/shared/kb/article/",
    trusted,
  );
  assert.equal(
    resolved.address.address,
    "10.172.65.101",
    "the validated address is pinned for the request",
  );
  await assert.rejects(
    validatePublicUrl("https://other.example.test/shared/article", trusted),
  );
  await assert.rejects(
    validatePublicUrl("http://tracker.slsoft.ru/shared/article", trusted),
  );
});

test("trusted origins cannot be widened to wildcards, plain HTTP, credentials, paths or IP literals", () => {
  for (const origin of [
    "https://*.slsoft.ru",
    "http://tracker.slsoft.ru",
    "https://user:pass@tracker.slsoft.ru",
    "https://tracker.slsoft.ru/api",
    "https://127.0.0.1",
    "https://10.0.0.1",
    "https://localhost",
    "https://tracker.slsoft.ru:8443",
  ]) {
    assert.throws(() => createSourceFetcher([origin]), undefined, origin);
  }
});

test("even a trusted source cannot resolve to loopback, link-local or metadata service addresses", async (t) => {
  let address = "127.0.0.1";
  t.mock.method(dns, "lookup", async () => [{ address, family: 4 }]);
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  for (address of [
    "127.0.0.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.100.100.200",
  ]) {
    await assert.rejects(
      validatePublicUrl(
        "https://tracker.slsoft.ru/shared/article",
        new Set(["https://tracker.slsoft.ru"]),
      ),
    );
  }
});
