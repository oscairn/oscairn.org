# Deploying oscairn.org (not done; the owner does this)

Today Pages serves the **root of `main`** (legacy "Deploy from a branch" build): `.nojekyll`, `CNAME`,
`README.md` and `.well-known/oscairn-publisher.json`. Nothing in this branch (`site`) has touched that.
The identity file is what makes packages work, so the order below keeps it served at every moment.

## Before the switch (all safe)

1. Build and look at it: `npm ci && npm run build && npm run preview`. The build prints
   `identity check ok: ... sha256 7999d808...608b23`; it fails otherwise.
2. Check `dist/.well-known/oscairn-publisher.json` is byte-identical to the file on `main`:
   `git show origin/main:.well-known/oscairn-publisher.json | shasum -a 256` and `shasum -a 256 dist/.well-known/oscairn-publisher.json`
   must print the same hash (`identity.sha256` holds it).
3. Review the pinned refs in `.github/workflows/pages.yml` (`OSCAIRN_REF`, `PACKAGES_REF`): the site shows the docs and
   packages at those commits. The CI checks out both repositories publicly; if either becomes private, add a token.
4. Remember the site now has no `noindex`: once live, search engines may index it.

## The switch

The branch keeps transition copies of `.well-known/oscairn-publisher.json`, `.nojekyll` and `CNAME` at the repository root
(the originals), beside the ones in `public/` that the build ships. So while Pages is still in "branch" mode, a merged
`main` keeps serving the identity file from the root, and the identity URL never goes away.

1. Merge `site` into `main`. Pages (branch mode) rebuilds; the identity URL still answers with the same bytes (verify
   with the `curl | shasum` line below). The root also exposes the site's source files; that is harmless and short-lived.
2. Settings > Pages > Build and deployment > Source: change "Deploy from a branch" to **GitHub Actions**. Keep the custom
   domain `oscairn.org` (the deployed `CNAME` file repeats it). Whether Pages keeps serving the last branch build until the
   first Actions deploy lands is unverified, so do step 3 straight away.
3. In `.github/workflows/pages.yml` remove the `#` in front of the `push:` trigger and its `branches` line (or run the
   workflow by hand: Actions > Pages > Run workflow). The deploy job needs the `github-pages` environment, which the
   switch creates.
4. When the run is green, verify from outside:

       curl -s https://oscairn.org/.well-known/oscairn-publisher.json | shasum -a 256
       # must be 7999d808125601eb87b72f1b80b3aa7bf77f79484fe2d6221ad9cbad9b608b23
       curl -sI https://oscairn.org/.well-known/oscairn-publisher.json | head -3     # 200, content-type application/json
       curl -sI https://oscairn.org/ | head -1; curl -sI https://oscairn.org/packages/ | head -1

5. After that, delete the transition copies at the root (`.well-known/`, `.nojekyll`, `CNAME`) in a follow-up commit;
   the build still ships them from `public/`.

## Rollback

The previous `main` commit (`d388147`, "Create CNAME") still holds the root layout. If the identity URL does not return
the same bytes, or the site is wrong:

1. Settings > Pages > Source: switch back to **Deploy from a branch**, branch `main`, folder `/ (root)`.
2. If needed, put the old tree back on `main`: `git revert -m 1 <merge commit>`. Pages rebuilds from the root and serves the
   identity file again (the root copies exist until step 5 above; the old commit has them too).
3. Verify with the `curl | shasum` line above.

Until step 1 of "The switch", `main` is unchanged and keeps serving the identity file.
