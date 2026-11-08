import { test } from "node:test";
import assert from "node:assert/strict";
import { alertsKey } from "../dist/alerts.js";

test("unread messages turn the key into ADVISORY", () => {
  assert.deepEqual(alertsKey(0, 0), { label: "ALERTS", unread: false });
  assert.deepEqual(alertsKey(2, 0), { label: "ADVISORY", unread: true });
  assert.deepEqual(alertsKey(2, 2), { label: "ALERTS", unread: false });
  assert.deepEqual(alertsKey(3, 2), { label: "ADVISORY", unread: true }); // a new one after reading
  assert.deepEqual(alertsKey(1, 3), { label: "ALERTS", unread: false }); // messages removed
});
