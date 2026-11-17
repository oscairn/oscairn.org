# oscairn.org

The source of the website at https://oscairn.org, built with Astro and Starlight. The docs, the device
profiles and the package records are not stored here: the build reads them from checkouts of
[oscairn/oscairn](https://github.com/oscairn/oscairn) (`docs/`, `hosts/standalone/profiles/`) and
[oscairn/packages](https://github.com/oscairn/packages).

**Do not remove `public/.well-known/oscairn-publisher.json`.** It names the publisher key of `org.oscairn`
in Oscairn's package repository (RFC 0031), and the package tools fetch it at
https://oscairn.org/.well-known/oscairn-publisher.json. The build fails if the output's copy is missing or
differs from the hash pinned in `identity.sha256` (`scripts/check-identity.mjs`). `public/.nojekyll` keeps
Pages from dropping the dot-folder and `public/CNAME` keeps the domain. Copies of the three files at the repository
root are transition copies for the legacy Pages build (DEPLOY.md); they go once Pages is switched to Actions.

## Build

Needs Node 22.23.4 or newer (built with 26.13.1).

    npm ci
    npm run build      # dist/, then the identity check
    npm run preview    # http://127.0.0.1:4321
    npm test           # link-rewriting tests

Where the inputs are (defaults are for a checkout inside Oscairn's workspace; override with environment variables):

| Variable | Default |
|---|---|
| `OSCAIRN_DOCS_DIR` | `../../../oscairn/docs` |
| `OSCAIRN_PACKAGES_DIR` | `../../../packages` |
| `OSCAIRN_PROFILES_DIR` | `<docs>/../hosts/standalone/profiles` |

`node scripts/check-links.mjs dist` checks every internal link and anchor; `./measure.sh` measures the build.
`src/data/devices.json` says which group each device profile belongs to. Notes on how it works: `REPORT.md`.
Deploying: `DEPLOY.md` (nothing here deploys by itself).

The font is Inter, self-hosted from `@fontsource/inter` under the SIL Open Font License (`public/FONTS-LICENSE.txt`).
