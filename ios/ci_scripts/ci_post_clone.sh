#!/bin/sh
set -eux
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npx expo prebuild --platform ios --no-install --clean
cd ios
pod install
