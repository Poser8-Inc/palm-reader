#!/bin/sh
# Xcode Cloud post-clone — install Node + regenerate Expo iOS project
# Apple workers do not have Node/npm preinstalled — brew install it.
set -eux

export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1

brew install node

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npx expo prebuild --platform ios --no-install --clean
cd ios
pod install
