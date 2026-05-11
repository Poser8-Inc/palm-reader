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

# Xcode 26's clang rejects fmt's consteval-based compile-time format-string
# validation ("Call to consteval function ... is not a constant expression"
# in fmt/format-inl.h). Builds 10/11/12 tried disabling this via the
# FMT_USE_CONSTEVAL=0 macro at the Podfile level; the errors persisted,
# suggesting the macro never reached the translation units instantiating
# the templates. Going direct: replace `consteval` with `constexpr` in
# the fmt headers post-install. constexpr is a strict superset (can run
# at compile time OR runtime), so runtime behavior is unchanged.
echo "==> Patching fmt headers: consteval -> constexpr"
find Pods/fmt -type f \( -name "*.h" -o -name "*.hpp" -o -name "*.cc" \) \
  -exec sed -i '' 's/\bconsteval\b/constexpr/g' {} +
echo "==> Verifying no consteval remaining in fmt headers"
if grep -rn '\bconsteval\b' Pods/fmt/include/ 2>/dev/null; then
  echo "WARNING: consteval still present in fmt headers after patch"
fi
