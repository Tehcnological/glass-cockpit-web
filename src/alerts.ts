// The PFD's last softkey. v13 trainer: it reads ADVISORY while a message is unread and ALERTS once the window has
// shown them (FG1000 always shows ALERTS). DOM-free, so it can be tested on its own.
export function alertsKey(count: number, seen: number): { label: "ALERTS" | "ADVISORY"; unread: boolean } {
  const unread = count > seen;
  return { label: unread ? "ADVISORY" : "ALERTS", unread };
}
