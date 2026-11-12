import test from "node:test";
import assert from "node:assert/strict";
import { contextQuery, withContext } from "../src/lib/navigation.ts";

test("material navigation carries collection context through nested pages without copying search offsets", () => {
  const query = {
    from: "collection",
    collection: "team",
    paragraph: "6",
    view: "pdf",
  };
  assert.deepEqual(contextQuery(query), {
    from: "collection",
    collection: "team",
  });
  assert.equal(
    withContext("/library/manual?page=start#intro", query),
    "/library/manual?page=start&from=collection&collection=team#intro",
  );
  assert.equal(
    withContext("/library/manual", { from: "knowledge" }),
    "/library/manual?from=knowledge",
  );
  assert.deepEqual(
    contextQuery({ from: ["collection"], collection: "team" }),
    {},
  );
  assert.deepEqual(
    contextQuery({ from: "collection", collection: "https://evil.test" }),
    {},
  );
});
