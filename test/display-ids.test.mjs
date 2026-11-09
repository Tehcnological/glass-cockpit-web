// Two displays on one page inline the same art. A url(#id) resolves to the first element in the document with that id,
// so if the first copy sits in a display:none display its gradients do not paint and the other's bezel keys go black.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeIds } from "../dist/display.js";
import BEZEL from "../dist/svg/bezel.js";
import PFD from "../dist/svg/pfd.js";

const refs = (s) => [...s.matchAll(/(?:url\(#|href="#)([^)"]+)/g)].map((m) => m[1]);
const ids = (s) => [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

test("each display's references resolve to its own copy of the art", () => {
  for (const art of [BEZEL, PFD]) {
    const a = scopeIds(art, "glass-d1-");
    const b = scopeIds(art, "glass-d2-");
    const all = ids(a + b);
    assert.ok(refs(art).length > 0);
    for (const [copy, own] of [[a, ids(a)], [b, ids(b)]])
      for (const r of refs(copy)) {
        assert.ok(own.includes(r), `${r} is in its own copy`);
        assert.equal(all.filter((i) => i === r).length, 1, `${r} is unique in the document`);
      }
  }
});

test("ids nothing references keep their names for Page.el and the bezel", () => {
  const s = scopeIds(BEZEL, "glass-d1-");
  for (const id of ["g13091", "rect8520", "path12508"]) assert.ok(ids(s).includes(id), id);
});
