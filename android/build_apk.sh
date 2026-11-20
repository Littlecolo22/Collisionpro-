#!/usr/bin/env bash
# Builds and signs the R&R Auto Express Android app (a shell around https://collisionpro.pages.dev).
# Usage: ./build_apk.sh [versionCode] [versionName]
# Keystore: android/.keystore/rr-release.p12, password in android/.keystore/password (both private, never committed).
# Updates MUST be signed with this same keystore, or Android refuses to install them over the old app.
set -euo pipefail
cd "$(dirname "$0")"
VC="${1:-1}"; VN="${2:-1.0}"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/home/sprite/android-sdk}}"
BT_VERSION="${ANDROID_BUILD_TOOLS_VERSION:-35.0.0}"
BT="$SDK/build-tools/$BT_VERSION"; JAR="$SDK/platforms/android-35/android.jar"
for tool in aapt2 d8 zipalign apksigner; do
  if [ ! -x "$BT/$tool" ]; then echo "Missing Android SDK tool: $BT/$tool" >&2; exit 2; fi
done
if [ ! -f "$JAR" ]; then echo "Missing Android platform jar: $JAR" >&2; exit 2; fi
if ! command -v javac >/dev/null || ! command -v keytool >/dev/null; then echo "Java JDK (javac + keytool) is required" >&2; exit 2; fi
OUT=build; rm -rf $OUT; mkdir -p $OUT/res $OUT/gen $OUT/classes
python3 make_icons.py
$BT/aapt2 compile --dir res -o $OUT/res.zip
$BT/aapt2 link -o $OUT/base.apk -I $JAR --manifest AndroidManifest.xml --java $OUT/gen \
  --min-sdk-version 24 --target-sdk-version 35 --version-code "$VC" --version-name "$VN" $OUT/res.zip
javac -nowarn -Xlint:-options -source 11 -target 11 -classpath $JAR -d $OUT/classes \
  $(find src $OUT/gen -name '*.java')
$BT/d8 --release --min-api 24 --lib $JAR --output $OUT $(find $OUT/classes -name '*.class')
(cd $OUT && cp base.apk unsigned.apk && zip -q -j unsigned.apk classes.dex)
$BT/zipalign -f -p 4 $OUT/unsigned.apk $OUT/aligned.apk
KS=.keystore/rr-release.p12
if [ ! -f $KS ]; then
  mkdir -p .keystore; chmod 700 .keystore
  python3 -c "import secrets;print(secrets.token_urlsafe(24))" > .keystore/password; chmod 600 .keystore/password
  keytool -genkeypair -keystore $KS -storetype PKCS12 -alias rr -keyalg RSA -keysize 3072 -validity 12000 \
    -storepass:file .keystore/password -dname "CN=R&R Auto Express, O=R&R Auto Express, C=US" >/dev/null 2>&1
  chmod 600 $KS
fi
$BT/apksigner sign --ks $KS --ks-key-alias rr --ks-pass file:.keystore/password --out $OUT/RR-Auto-Express.apk $OUT/aligned.apk
$BT/apksigner verify --print-certs $OUT/RR-Auto-Express.apk | head -3
ls -la $OUT/RR-Auto-Express.apk
