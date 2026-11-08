/** `seen`: the messages the ALERTS window has shown. A message is unread until the window shows it. */
export declare function alertsKey(alerts: readonly string[], seen: readonly string[]): {
    label: "ALERTS" | "ADVISORY";
    unread: boolean;
};
