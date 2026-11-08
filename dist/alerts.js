// The PFD's last softkey. v13 trainer: it reads ADVISORY while a message is unread and ALERTS once the window has
// shown them (FG1000 always shows ALERTS). DOM-free, so it can be tested on its own.
/** `seen`: the messages the ALERTS window has shown. A message is unread until the window shows it. */
export function alertsKey(alerts, seen) {
    const unread = alerts.some((a) => !seen.includes(a));
    return { label: unread ? "ADVISORY" : "ALERTS", unread };
}
