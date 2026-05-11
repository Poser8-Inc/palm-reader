#!/bin/sh
# Xcode Cloud post-clone — Expo + Node install
set -eux
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1
brew install node

# Apple sets CI=TRUE (uppercase) but Expo getenv expects lowercase.
# Override before any expo commands run.
export CI=true

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install --legacy-peer-deps --no-audit --no-fund
npx expo prebuild --platform ios --no-install --clean
cd ios
pod install
