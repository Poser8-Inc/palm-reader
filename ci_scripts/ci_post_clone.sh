#!/bin/sh
# Xcode Cloud post-clone — Expo + Node install
set -eux
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_INSTALLED_DEPENDENTS_CHECK=1
brew install node

# Apple sets CI=TRUE (uppercase) but Expo getenv expects lowercase.
export CI=true

# Apples internal HTTP proxy at 172.16.103.28:8088 sometimes fails for pod git
# clones (SDWebImageWebPCoder etc). Unset proxies and force HTTPS for github so
# pod install talks to GitHub directly.
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy
git config --global url."https://github.com/".insteadOf "git@github.com:"
git config --global url."https://github.com/".insteadOf "http://github.com/"

cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install --legacy-peer-deps --no-audit --no-fund
npx expo prebuild --platform ios --no-install --clean
cd ios
pod install
