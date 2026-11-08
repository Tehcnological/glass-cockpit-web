# CLAUDE.md (glass-cockpit-web)

Standing instructions for Claude Code in this repo. The local folder is `glass-pfd`; the repo is `Tehcnological/glass-cockpit-web`.

## Project

A browser glass cockpit (PFD, MFD, bezel) ported to TypeScript from FlightGear's FG1000, plus the Vue components instrumentready.com uses (`vue/`). Consumer: `Tehcnological/instrumentready.com`, which installs it as `github:Tehcnological/glass-cockpit-web#<commit>` (pinned in its package.json; update with the same command and the new commit). Read README.md for the API and NOTICE.md for what came from FlightGear.

GCW owns the FAA NASR/CIFP transformations (`src/navdata.ts`, the separate `glass-cockpit-web/navdata` export, never imported by the displays). instrumentready.com owns the downloads, the cycle and the Phoenix cut.

## Hard constraints

- TypeScript. GPL-2.0-or-later, as FlightGear is. Contributions come in under the same license; no copyright assignment.
- Follow FG1000. Ported code names its Nasal source in the file header. Where the port departs from FG1000, say so in a comment and in the README.
- No runtime dependencies. `vue` stays an optional peer; `@openattitude/*` is the site's to install.
- Don't break the install path: `dist/` and `src/svg/` stay committed and current, no `prepare` script. Never edit `src/svg/` by hand.
- Not affiliated with Garmin. Not for navigation or flight use.
- No secrets in the repo. Nothing that bills without Chris's say.

## How Chris works

- Concise and direct. Never use em dashes, in chat or in files.
- Get a visual direction from Chris before building new design.

## Commands

```sh
npm install
npm test          # tsc, then node --test test/
npm run build     # src/fg1000 -> src/svg, then dist/; commit both with the change
npx serve .       # demo at index.html
```

GitHub Actions runs on every PR and every push to main, on standard hosted runners, free because this repo is public. It fails if `dist/` or `src/svg/` is stale. See "CI" in README.md.

When public API, controls or the "Not ported" list change, update README.md and CHANGELOG.md in the same PR.

Commit as `git -c user.name="Chris DeFoe" -c user.email="chris@defoe.me"`.
