#!/usr/bin/env bash
# Run from any directory on the MacinCloud Mac.
# Pulls + prebuilds + pod-installs the 5 remaining flat Templari apps so
# their workspaces are ready for Xcode Cloud workflow enrollment.
set -e
ROOT="${TEMPLARI_ROOT:-$HOME/templari}"
for app in aura graphology auspex aleph numerology; do
echo
echo "==== $app ===="
cd "$ROOT/$app"
rm -f package-lock.json
git pull
npm install --legacy-peer-deps --no-audit --no-fund
npx expo prebuild --platform ios --no-install --clean
( cd ios && pod install )
done
echo
echo "DONE. Workspaces ready. Open each in Xcode and:"
echo "  Product -> Xcode Cloud -> Create Workflow"
echo "Apps: Aura, Graphology, Auspex (may open as Vedic.xcworkspace), Aleph, Numerology"
