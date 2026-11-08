import { test } from "node:test";
import assert from "node:assert/strict";
import { alertsKey, seenAlerts } from "../dist/alerts.js";

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

test("the window reads every message; a removed message is forgotten, so it is unread if posted again", () => {
  assert.deepEqual(seenAlerts(["A", "B"], [], true), ["A", "B"]);
  assert.deepEqual(seenAlerts(["B"], ["A", "B"], false), ["B"]);
  const seen = seenAlerts([], seenAlerts(["A"], [], true), false);
  assert.deepEqual(alertsKey(["A"], seen), { label: "ADVISORY", unread: true });
});
