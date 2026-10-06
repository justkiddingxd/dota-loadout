#!/bin/sh
# Builds the site and copies it to a static folder (loadout.nyan.cafe by default):
#   tools/deploy.sh [target dir]
set -e
cd "$(dirname "$0")/.."
TARGET="${1:-/var/www/rin_ms_usr/data/www/loadout.nyan.cafe}"
npx vite build --config vite.config.mjs
mkdir -p "$TARGET"
# Heroes first, the page last: a visitor never gets a page whose heroes are not there yet.
rsync -a --delete --exclude index.html dist/ "$TARGET/"
cp dist/index.html "$TARGET/index.html"
echo "→ $TARGET"
