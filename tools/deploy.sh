#!/bin/sh
# Builds the site and copies it to a static folder (loadout.nyan.cafe by default):
#   tools/deploy.sh [target dir]
set -e
cd "$(dirname "$0")/.."
TARGET="${1:-/var/www/rin_ms_usr/data/www/loadout.nyan.cafe}"
npx vite build --config vite.config.mjs
mkdir -p "$TARGET"
# Heroes first, the page last: a visitor never gets a page whose heroes are not there yet. The .gz
# files beside them are this script's own (below), not the build's to delete.
rsync -a --delete --exclude index.html --exclude '*.gz' --exclude /design/ dist/ "$TARGET/"
# A .gz beside each model and data file that is newer than its own (nginx's gzip_static sends it
# instead: a model a fifth of its size); those whose file is gone go too.
find "$TARGET" -type f \( -name '*.glb' -o -name '*.json' -o -name '*.js' -o -name '*.css' \) -print0 |
  xargs -0 -P "$(nproc)" -n 200 sh -c 'for f; do [ "$f.gz" -nt "$f" ] || gzip -6 -c "$f" > "$f.gz"; done' sh
find "$TARGET" -type f -name '*.gz' -print0 | xargs -0 -P "$(nproc)" -n 500 sh -c 'for g; do [ -e "${g%.gz}" ] || rm -f "$g"; done' sh
cp dist/index.html "$TARGET/index.html"
echo "→ $TARGET"
