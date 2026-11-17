#!/usr/bin/env bash
# Measures the Astro + Starlight build. Run from anywhere: ./measure.sh  (needs `npm ci` done; takes about a minute).
# Definitions are shared with the other build's measurement, see the coordinator's brief.
set -u
cd "$(dirname "$0")"
export PATH=/opt/homebrew/bin:$PATH ASTRO_TELEMETRY_DISABLED=1
[ -d measure/node_modules ] || (cd measure && npm ci --silent)

echo "== footprint"
echo "node $(node -v), npm $(npm -v), astro $(node -p "require('./node_modules/astro/package.json').version"), starlight $(node -p "require('./node_modules/@astrojs/starlight/package.json').version")"
echo "npm packages installed (npm ls --all, unique): $(npm ls --all --parseable 2>/dev/null | sed 1d | sed 's#.*/node_modules/##' | sort -u | wc -l | tr -d ' ')"
echo "node_modules size: $(du -sh node_modules | cut -f1)"
echo "own source lines (git ls-files, excluding the lockfiles, REPORT.md, DEPLOY.md, README.md, public/ and the root transition copies):"
git ls-files | grep -v -e package-lock.json -e '^REPORT.md' -e '^DEPLOY.md' -e '^README.md' -e '^public/' -e '^\.well-known/' -e '^CNAME' -e '^\.nojekyll' -e identity.sha256 | xargs wc -l | awk '{n=$2; if (n=="total") {print "  total", $1; next} ext=n; sub(/.*\./,"",ext); c[ext]+=$1} END{for(e in c) print "  ."e, c[e]}' | sort

echo "== build time (clean: dist, .astro and caches removed first; 3 runs)"
times=()
for i in 1 2 3; do
  rm -rf dist .astro node_modules/.astro node_modules/.vite
  s=$(python3 -c 'import time;print(time.time())')
  npm run build --silent >/tmp/astro-build-$i.log 2>&1 || { echo "build failed, see /tmp/astro-build-$i.log"; exit 1; }
  e=$(python3 -c 'import time;print(time.time())')
  t=$(python3 -c "print(round($e-$s,2))"); times+=("$t"); echo "  run $i: ${t}s"
done
echo "  median: $(printf '%s\n' "${times[@]}" | sort -n | sed -n 2p)s"
echo "== rebuild after touching one doc (caches kept; docs read from a copy so the code repository is untouched)"
tmp=$(mktemp -d); cp -a "${OSCAIRN_DOCS_DIR:-../../../oscairn/docs}" "$tmp/docs"; touch "$tmp/docs/architecture.md"
s=$(python3 -c 'import time;print(time.time())')
OSCAIRN_DOCS_DIR="$tmp/docs" npm run build --silent >/dev/null 2>&1
e=$(python3 -c 'import time;print(time.time())'); echo "  $(python3 -c "print(round($e-$s,2))")s"; rm -rf "$tmp"
npm run build --silent >/dev/null 2>&1   # leave dist built from the real docs

echo "== output"
echo "files: $(find dist -type f | wc -l | tr -d ' ')"
echo "bytes: $(find dist -type f -print0 | xargs -0 stat -f %z | awk '{s+=$1} END{print s}')"
echo "gzip bytes (each file gzipped alone, -9): $(find dist -type f -print0 | xargs -0 -n1 sh -c 'gzip -9 -c "$0" | wc -c' | awk '{s+=$1} END{print s}')"
echo "== pages (bytes raw, gzip) and axe"
node measure/pages.mjs
echo "== search"
echo "pagefind dir: $(du -sk dist/pagefind | cut -f1) KiB in $(find dist/pagefind -type f | wc -l | tr -d ' ') files; fragments loaded on demand: $(ls dist/pagefind/fragment | wc -l | tr -d ' ') fragment files, index chunks: $(ls dist/pagefind/index | wc -l | tr -d ' ')"
echo "pagefind referenced from a docs page: $(grep -o 'pagefind[a-z-]*\.js\|/pagefind/pagefind[^"]*' dist/docs/architecture/index.html | sort -u | tr '\n' ' ')"
echo "== identity file in dist"
node scripts/check-identity.mjs dist
echo "== link check"
node scripts/check-links.mjs dist
echo "== serve on 127.0.0.1 and fetch"
python3 -I -m http.server 4399 --bind 127.0.0.1 --directory dist >/tmp/astro-preview.log 2>&1 &  # a plain static server, like Pages (astro preview does not serve dot-folders)
pid=$!; sleep 2
for u in /.well-known/oscairn-publisher.json / /docs/ /docs/rfcs/0001-license/ /packages/ /packages/org.oscairn.sampler/ /devices/ /pagefind/pagefind.js /docs-images/desktop/home.png /nope/; do
  echo "  $u -> $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4399$u)"
done
kill $pid 2>/dev/null; wait $pid 2>/dev/null; echo "server stopped"
