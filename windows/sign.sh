#!/bin/bash
# Signs a Windows exe in place with Azure Trusted Signing through jsign (SPEC §10.25.13).
#   windows/sign.sh <exe>     sign it, or say "unsigned" when no WALLPAPERS_SIGN_* is set
#   windows/sign.sh --verify <exe>  osslsigncode verify, trusting Microsoft's root
#   windows/sign.sh --fetch   only download and verify jsign and the root (no secrets needed)
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
# The root every Trusted Signing chain, and its timestamp chain, ends at; Linux CA bundles lack it.
# Its sha256 is Microsoft's published thumbprint for this certificate.
ROOT_URL="https://www.microsoft.com/pkiops/certs/Microsoft%20Identity%20Verification%20Root%20Certificate%20Authority%202020.crt"
ROOT_SHA256=5367f20c7ade0e2bca790915056d086b720c33c1fa2a2661acf787e3292e1270 # audit-allow: public sha256 of Microsoft's root certificate
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

# Downloads Microsoft's root (DER) once, checks its sha256, and prints the path of a PEM copy.
fetch_root() {
  local der="$CACHE/ms-identity-root-2020.crt" got
  mkdir -p "$CACHE"
  if [ ! -f "$der" ]; then
    curl -fsSL -o "$der.part" "$ROOT_URL" || { rm -f "$der.part"; fail "couldn't download $ROOT_URL"; }
    mv "$der.part" "$der"
  fi
  got=$(sha256sum "$der" | cut -d' ' -f1)
  if [ "$got" != "$ROOT_SHA256" ]; then
    rm -f "$der"
    fail "Microsoft's root certificate doesn't match its pinned sha256 (removed it from the cache)"
  fi
  command -v openssl >/dev/null || fail "needs openssl"
  openssl x509 -inform DER -in "$der" -out "$der.pem" || fail "couldn't read the root certificate"
  echo "$der.pem"
}

if [ "$1" = "--fetch" ]; then
  jar=$(fetch_jsign) || exit 1
  root=$(fetch_root) || exit 1
  echo "jsign $JSIGN_VERSION ok: $jar"
  echo "root certificate ok: $root"
  exit 0
fi

if [ "$1" = "--verify" ]; then
  [ -f "$2" ] || fail "usage: sign.sh --verify <exe>"
  command -v osslsigncode >/dev/null || fail "$2 was signed but osslsigncode isn't installed to verify it"
  root=$(fetch_root) || exit 1
  osslsigncode verify -CAfile "$root" -TSA-CAfile "$root" "$2" >/dev/null || fail "$2's signature doesn't verify"
  echo "verified $2"
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

# Entra ID client credentials; every field is URL-encoded, and the secret goes in on stdin, not on a command line.
response=$(printf '%s' "$WALLPAPERS_SIGN_CLIENT_SECRET" | curl -fsS \
  "https://login.microsoftonline.com/$WALLPAPERS_SIGN_TENANT/oauth2/v2.0/token" \
  --data-urlencode "client_id=$WALLPAPERS_SIGN_CLIENT_ID" \
  --data-urlencode "scope=$SCOPE" \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_secret@-") || fail "couldn't get an access token (check the tenant, client id and secret)"
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
