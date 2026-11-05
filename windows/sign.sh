#!/bin/bash
# Signs a Windows exe in place with Azure Trusted Signing through jsign (SPEC §10.25.13).
#   windows/sign.sh <exe>     sign it, or say "unsigned" when no WALLPAPERS_SIGN_* is set
#   windows/sign.sh --fetch   only download and verify jsign (no secrets needed)
# It signs only when all six WALLPAPERS_SIGN_* variables are set. None set is an
# unsigned build (exit 0); a partial set is a mistake and fails, so a release never
# goes out unsigned by accident. Secrets are never echoed: no `set -x`, and the token
# lives in a variable (jsign takes it as an argument, as its Trusted Signing mode requires).
set -e
cd "$(dirname "$0")/.."

# Pinned jsign release, from https://github.com/ebourg/jsign/releases/tag/7.6
JSIGN_VERSION=7.6
JSIGN_URL="https://github.com/ebourg/jsign/releases/download/$JSIGN_VERSION/jsign-$JSIGN_VERSION.jar"
JSIGN_SHA256=6cf58aa080e7ff82656f320cff8d4a3bff30408df8766806dcba3740dd839fa5 # audit-allow: public sha256 of the pinned jsign jar
CACHE="${XDG_CACHE_HOME:-dist}/wallpapers-tools"
TIMESTAMP_URL=http://timestamp.acs.microsoft.com
SCOPE=https://codesigning.azure.net/.default
VARS=(ENDPOINT ACCOUNT PROFILE TENANT CLIENT_ID CLIENT_SECRET)

fail() { echo "sign.sh: $1" >&2; exit 1; }

# Downloads jsign once into the cache and checks its sha256; prints the jar's path.
fetch_jsign() {
  local jar="$CACHE/jsign-$JSIGN_VERSION.jar" got
  mkdir -p "$CACHE"
  if [ ! -f "$jar" ]; then
    curl -fsSL -o "$jar.part" "$JSIGN_URL" || { rm -f "$jar.part"; fail "couldn't download $JSIGN_URL"; }
    mv "$jar.part" "$jar"
  fi
  got=$(sha256sum "$jar" | cut -d' ' -f1)
  if [ "$got" != "$JSIGN_SHA256" ]; then
    rm -f "$jar"
    fail "jsign $JSIGN_VERSION doesn't match its pinned sha256 (removed it from the cache)"
  fi
  echo "$jar"
}

if [ "$1" = "--fetch" ]; then
  jar=$(fetch_jsign) || exit 1
  echo "jsign $JSIGN_VERSION ok: $jar"
  exit 0
fi

EXE=$1
[ -n "$EXE" ] || fail "usage: sign.sh <exe>"

missing=()
for v in "${VARS[@]}"; do
  [ -n "$(printenv "WALLPAPERS_SIGN_$v")" ] || missing+=("WALLPAPERS_SIGN_$v")
done
if [ ${#missing[@]} -eq ${#VARS[@]} ]; then
  echo "unsigned (no WALLPAPERS_SIGN_* variables)"
  exit 0
fi
if [ ${#missing[@]} -gt 0 ]; then
  list=$(IFS=,; echo "${missing[*]}")
  fail "missing ${list//,/, }"
fi

[ -f "$EXE" ] || fail "no $EXE"
command -v java >/dev/null || fail "signing needs java"
JAR=$(fetch_jsign) || exit 1

# Entra ID client credentials; the secret goes in on stdin, not on a command line.
response=$(printf 'client_secret=%s' "$WALLPAPERS_SIGN_CLIENT_SECRET" | curl -fsS \
  "https://login.microsoftonline.com/$WALLPAPERS_SIGN_TENANT/oauth2/v2.0/token" \
  --data-urlencode "client_id=$WALLPAPERS_SIGN_CLIENT_ID" \
  --data-urlencode "scope=$SCOPE" \
  --data-urlencode "grant_type=client_credentials" \
  --data @-) || fail "couldn't get an access token (check the tenant, client id and secret)"
TOKEN=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf8")).access_token || "")' <<< "$response") \
  || fail "the token response wasn't JSON"
unset response
[ -n "$TOKEN" ] || fail "the token response had no access_token"

# jsign wants the endpoint's host, not a URL.
endpoint=${WALLPAPERS_SIGN_ENDPOINT#https://}
endpoint=${endpoint%/}
java -jar "$JAR" --storetype TRUSTEDSIGNING --keystore "$endpoint" \
  --alias "$WALLPAPERS_SIGN_ACCOUNT/$WALLPAPERS_SIGN_PROFILE" --storepass "$TOKEN" \
  --alg SHA-256 --tsaurl "$TIMESTAMP_URL" "$EXE" >/dev/null || fail "jsign failed on $EXE"
echo "signed $EXE"
