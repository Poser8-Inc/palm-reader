#!/bin/sh
# Xcode Cloud post-clone — palm-reader
# Generates the Expo iOS native project at /Volumes/workspace/repository/ios/
set -eux
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npx expo prebuild --platform ios --no-install --clean
cd ios
pod install
