/** `seen`: the messages the ALERTS window has shown. A message is unread until the window shows it. */
export declare function alertsKey(alerts: readonly string[], seen: readonly string[]): {
    label: "ALERTS" | "ADVISORY";
    unread: boolean;
};
/** The messages read: all of them while the ALERTS window is open; a message removed is forgotten, so it is unread if posted again. */
export declare function seenAlerts(alerts: readonly string[], seen: readonly string[], open: boolean): string[];
