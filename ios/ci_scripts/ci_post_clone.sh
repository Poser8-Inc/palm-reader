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

# Xcode 26's clang rejects fmt's consteval-based compile-time format-string
# validation ("Call to consteval function ... is not a constant expression"
# in fmt/format-inl.h). Hermes uses fmt internally; disabling consteval
# validation leaves runtime behavior unchanged. Inject FMT_USE_CONSTEVAL=0
# into the fmt pod via the generated Podfile's post_install hook.
python3 - <<'PYEOF'
from pathlib import Path
p = Path("ios/Podfile")
content = p.read_text()
inject = (
    "    # CI: disable fmt consteval (Xcode 26 + RN 0.76 incompat)\n"
    "    installer.pods_project.targets.each do |t|\n"
    "      if t.name == 'fmt'\n"
    "        t.build_configurations.each do |c|\n"
    "          c.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']\n"
    "          c.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'\n"
    "        end\n"
    "      end\n"
    "    end\n"
)
marker = "post_install do |installer|\n"
if marker in content:
    content = content.replace(marker, marker + inject, 1)
else:
    content += "\npost_install do |installer|\n" + inject + "end\n"
p.write_text(content)
print("Patched Podfile with fmt consteval workaround")
PYEOF

cd ios
pod install
