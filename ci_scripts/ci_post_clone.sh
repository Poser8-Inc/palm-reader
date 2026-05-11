#!/bin/sh
# Xcode Cloud post-clone script — palm-reader (flat repo)
#
# Generates the Expo iOS native project on each build.
# ios/ is gitignored per suite-wide decision; regenerated here.
#
# Required env vars (set in Xcode Cloud workflow → Environment):
#   EXPO_PUBLIC_REVENUECAT_IOS_KEY
#   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
#   EXPO_PUBLIC_SUPABASE_URL
#   EXPO_PUBLIC_SUPABASE_ANON_KEY
#   EXPO_PUBLIC_PALM_ORACLE_URL

set -eux

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci

npx expo prebuild --platform ios --no-install --clean

cd ios
pod install

