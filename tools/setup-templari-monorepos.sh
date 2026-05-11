#!/usr/bin/env bash
# Run from any directory on the MacinCloud Mac.
# Pulls + prebuilds + pod-installs the 2 Templari monorepos:
# - the-hidden-library (single-repo monorepo, app/ subdir)
# - arcana (yarn-workspaces monorepo, apps/mobile subdir, root npm install)
set -e
ROOT="${TEMPLARI_ROOT:-$HOME/templari}"

echo
echo "==== the-hidden-library ===="
cd "$ROOT/the-hidden-library"
rm -f app/package-lock.json
git pull
cd app
npm install --legacy-peer-deps --no-audit --no-fund
npx expo prebuild --platform ios --no-install --clean
( cd ios && pod install )

echo
echo "==== arcana ===="
cd "$ROOT/arcana"
rm -rf node_modules package-lock.json
git pull
npm install --legacy-peer-deps --no-audit --no-fund
cd apps/mobile
npx expo prebuild --platform ios --no-install --clean
( cd ios && pod install )

echo
echo "DONE. Workspaces ready:"
echo "  open ~/templari/the-hidden-library/app/ios/*.xcworkspace"
echo "  open ~/templari/arcana/apps/mobile/ios/*.xcworkspace"
echo "Then in each: Integrate -> Create Workflow"
