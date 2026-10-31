#!/usr/bin/env bash
# Build the SOUL LINK Android APK without Gradle.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
APP_DIR="$ANDROID_DIR/app/src/main"
BUILD="$ANDROID_DIR/build"
OUT_DIR="$ROOT/download"
APK_OUT="$OUT_DIR/soul-link-launcher.apk"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
if [ ! -d "$SDK" ]; then
  echo "Android SDK not found. Set ANDROID_HOME." >&2
  exit 1
fi
BUILD_TOOLS="${BUILD_TOOLS:-$(ls -1 "$SDK/build-tools" | sort -V | tail -1)}"
BT="$SDK/build-tools/$BUILD_TOOLS"
PLATFORM_JAR="$SDK/platforms/android-35/android.jar"
if [ ! -f "$PLATFORM_JAR" ]; then
  PLATFORM_JAR="$(ls -1d "$SDK"/platforms/android-* | sort -V | tail -1)/android.jar"
fi
for tool in aapt2 d8 zipalign apksigner; do
  if [ ! -x "$BT/$tool" ]; then
    echo "Missing build tool: $BT/$tool" >&2
    exit 1
  fi
done

echo "==> Staging web assets"
rm -rf "$APP_DIR/assets/www"
mkdir -p "$APP_DIR/assets/www"
cp "$ROOT/index.html" "$ROOT/styles.css" "$ROOT/manifest.webmanifest" "$APP_DIR/assets/www/"
cp -R "$ROOT/js" "$ROOT/assets" "$ROOT/vendor" "$APP_DIR/assets/www/"

echo "==> Compiling resources (build-tools $BUILD_TOOLS)"
rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/dex" "$OUT_DIR"
"$BT/aapt2" compile --dir "$APP_DIR/res" -o "$BUILD/res.zip"
"$BT/aapt2" link \
  -o "$BUILD/base.apk" \
  -I "$PLATFORM_JAR" \
  --manifest "$APP_DIR/AndroidManifest.xml" \
  -A "$APP_DIR/assets" \
  -R "$BUILD/res.zip" \
  --java "$BUILD/gen" \
  --min-sdk-version 23 \
  --target-sdk-version 35 \
  --version-code 1 \
  --version-name 1.0.0 \
  --auto-add-overlay

echo "==> Compiling Java"
find "$BUILD/gen" -name '*.java' > "$BUILD/sources.txt"
find "$APP_DIR/java" -name '*.java' >> "$BUILD/sources.txt"
javac --release 11 -classpath "$PLATFORM_JAR" -d "$BUILD/classes" @"$BUILD/sources.txt"

echo "==> Dexing"
# shellcheck disable=SC2046
"$BT/d8" --release --lib "$PLATFORM_JAR" --min-api 23 --output "$BUILD/dex" \
  $(find "$BUILD/classes" -name '*.class')

echo "==> Packaging"
cp "$BUILD/base.apk" "$BUILD/unsigned.apk"
(cd "$BUILD/dex" && zip -q -j "$BUILD/unsigned.apk" classes.dex)
"$BT/zipalign" -f 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"

KEYSTORE="$ANDROID_DIR/keystore/soullink-debug.jks"
if [ ! -f "$KEYSTORE" ]; then
  echo "==> Creating debug keystore"
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair \
    -keystore "$KEYSTORE" \
    -storepass soullink \
    -keypass soullink \
    -alias soullink \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -dname "CN=SOUL LINK, OU=Fan Project, O=SOUL LINK, L=Web, S=Web, C=RU" >/dev/null
fi

echo "==> Signing"
"$BT/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:soullink \
  --key-pass pass:soullink \
  --out "$APK_OUT" \
  "$BUILD/aligned.apk"
"$BT/apksigner" verify --print-certs "$APK_OUT" | head -4

echo "==> Manifest"
"$BT/aapt2" dump badging "$APK_OUT" | head -6

echo "APK: $APK_OUT ($(du -h "$APK_OUT" | cut -f1))"
