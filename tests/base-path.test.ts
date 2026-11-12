import test from "node:test";
import assert from "node:assert/strict";
import { createPaths } from "../shared/paths.ts";

test("standalone paths retain existing public links", () => {
  const paths = createPaths("");
  assert.equal(paths.catalog, "/library");
  assert.equal(paths.material("doc"), "/library/doc");
  assert.equal(paths.public("/api/session"), "/api/session");
});
test("mounted library separates router paths and public URLs without duplicate prefixes", () => {
  const paths = createPaths("/library/");
  assert.equal(paths.catalog, "/");
  assert.equal(paths.material("doc"), "/materials/doc");
  assert.equal(paths.public(paths.material("doc")), "/library/materials/doc");
  assert.equal(paths.public("/api/session"), "/library/api/session");
  assert.equal(
    paths.internal("/library/materials/doc?page=one#heading"),
    "/materials/doc?page=one#heading",
  );
  assert.equal(paths.internal("/library-other/doc"), "/library-other/doc");
});
test("base path rejects external URLs, traversal and query strings", () => {
  for (const value of ["https://bad.test", "//host", "/a/../b", "/library?x=1"])
    assert.throws(() => createPaths(value));
});
