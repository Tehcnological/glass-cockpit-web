import { test } from "node:test";
import assert from "node:assert/strict";
import { alertsKey } from "../dist/alerts.js";

test("unread messages turn the key into ADVISORY", () => {
  assert.deepEqual(alertsKey([], []), { label: "ALERTS", unread: false });
  assert.deepEqual(alertsKey(["A", "B"], []), { label: "ADVISORY", unread: true });
  assert.deepEqual(alertsKey(["A", "B"], ["A", "B"]), { label: "ALERTS", unread: false });
  assert.deepEqual(alertsKey(["A", "B", "C"], ["A", "B"]), { label: "ADVISORY", unread: true }); // a new one after reading
  assert.deepEqual(alertsKey(["A"], ["A", "B", "C"]), { label: "ALERTS", unread: false }); // messages removed
});

test("a message replaced by another in one update is unread", () => {
  assert.deepEqual(alertsKey(["B"], ["A"]), { label: "ADVISORY", unread: true });
});
