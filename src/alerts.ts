// The PFD's last softkey. v13 trainer: it reads ADVISORY while a message is unread and ALERTS once the window has
// shown them (FG1000 always shows ALERTS). DOM-free, so it can be tested on its own.
/** `seen`: the messages the ALERTS window has shown. A message is unread until the window shows it. */
export function alertsKey(alerts: readonly string[], seen: readonly string[]): { label: "ALERTS" | "ADVISORY"; unread: boolean } {
  const unread = alerts.some((a) => !seen.includes(a));
  return { label: unread ? "ADVISORY" : "ALERTS", unread };
}

/** The messages read: all of them while the ALERTS window is open; a message removed is forgotten, so it is unread if posted again. */
export function seenAlerts(alerts: readonly string[], seen: readonly string[], open: boolean): string[] {
  return open ? [...alerts] : seen.filter((m) => alerts.includes(m));
}
