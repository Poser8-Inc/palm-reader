#!/bin/sh
# Xcode Cloud post-clone — Expo + Node install
# Using npm install (not npm ci) because lockfile generation on Alien used
# a slightly different npm version than Apple workers; npm install adapts.
set -eux
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1

brew install node

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install --legacy-peer-deps --no-audit --no-fund
npx expo prebuild --platform ios --no-install --clean
cd ios
pod install
