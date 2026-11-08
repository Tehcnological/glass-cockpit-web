# Contributing

Issues and pull requests are welcome.

## Before you start

- Bugs and feature requests: open an issue with the template. Check [Not ported](README.md#not-ported) first; anything listed there is known.
- Security problems: see [SECURITY.md](SECURITY.md). Do not open a public issue.
- Larger changes: open an issue first, so we can agree on the approach before you write it.

## License of contributions

The project is GPL-2.0-or-later, as FlightGear is. By opening a pull request you agree that your change is licensed under GPL-2.0-or-later. Only submit code you wrote or have the right to license that way.

## Making a change

Needs Node 22 or newer.

```sh
npm install
npm test        # tsc, then the unit tests in test/
npm run build   # regenerates src/svg/ and dist/
```

- Commit `dist/` and `src/svg/` with every source change. Sites install this package straight from GitHub without building, and CI fails if they are stale. Do not add a `prepare` script.
- Do not edit `src/svg/`; it is generated from `src/fg1000/` by `scripts/build-svg.mjs`.
- No runtime dependencies. `vue` stays an optional peer.
- Follow FG1000. When you port behaviour from its Nasal code, name the Nasal file in the header comment of the file you change, as the existing files do. Where this port does something FG1000 does not, say so in a comment and in the README.
- Add or update a test in `test/` for logic that can run outside a browser (bezel input, radio tuning, navigation math).
- If you change the public API (`PfdState`, `MfdState`, options, callbacks or exports), update the README.
- Keep `vue/` working for instrumentready.com. CI only checks those files are present, so say in the PR how you checked them.

## Pull requests

One change per pull request, against `main`. CI (`build-and-test`) must pass. The PR template lists the checks.

## Code of Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
