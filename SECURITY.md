# Security

## Supported versions

Only the latest commit on `main` is supported. Fixes are not backported.

## Reporting a vulnerability

Do not open a public issue. Use [Report a vulnerability](https://github.com/Tehcnological/glass-cockpit-web/security/advisories/new) on the repo's Security tab; that is the only channel. Include:

- what the problem is and where (file, function or input),
- how to reproduce it,
- what an attacker could do with it.

You will get a reply within 7 days. Once a fix is on `main`, you are credited in the commit unless you ask not to be.

## Scope

glass-cockpit-web runs in the browser and draws SVG from the state a host passes to `set()`. It makes no network requests and stores nothing. The most likely problems are in how it puts host-supplied text (identifiers, names, frequencies, checklist items) into the page. Reports about those are in scope. Problems in a site that uses the package belong to that site.
