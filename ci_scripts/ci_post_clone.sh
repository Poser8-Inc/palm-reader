#!/bin/sh
# Xcode Cloud post-clone — palm-reader
# Apple looks for ci_scripts at the workspace level (ios/), not repo root.
# This script will be wiped by `expo prebuild --clean` mid-run, but it has
# already been read into memory by Apple, so that's fine.
set -eux
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npx expo prebuild --platform ios --no-install --clean
cd ios
pod install
