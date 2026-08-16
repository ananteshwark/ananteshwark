#!/usr/bin/env bash
# Enable HTTPS for the CMS on vendorcontracts.ikshealth.com using a purchased
# wildcard certificate (RapidSSL/DigiCert *.ikshealth.com). Designed for the
# air-gapped box — no certbot / Let's Encrypt.
#
# Run ON THE SERVER (iksdc-078). Your key stays on the box: if the key is
# passphrase-encrypted, the passphrase is typed interactively and is never
# stored anywhere except the decrypted key file (root-only, mode 600).
#
# Usage:
#   sudo bash setup-https.sh <leaf.crt> <key> [intermediate-or-cabundle.crt]
#
# Example (with the RapidSSL intermediate — recommended, gives a complete chain):
#   sudo bash setup-https.sh star_ikshealth_com.crt ikspk.txt RapidSSLTLSRSACAG1.crt
#
# If you omit the intermediate the script installs the leaf alone and WARNS —
# some clients (Java, older mobiles, curl) will then fail chain validation.
set -euo pipefail

DOMAIN="vendorcontracts.ikshealth.com"
SSL_DIR="/etc/nginx/ssl"
APP_ROOT="/opt/cms/app/frontend/dist"
BACKEND="127.0.0.1:8000"
STAMP="$(date +%Y-%m-%d-%H%M)"

LEAF="${1:?usage: sudo bash setup-https.sh <leaf.crt> <key> [intermediate.crt]}"
KEY_IN="${2:?missing key argument}"
INTER="${3:-}"

[ "$(id -u)" -eq 0 ] || { echo "!! run with sudo/root"; exit 1; }
command -v openssl >/dev/null || { echo "!! openssl not found"; exit 1; }
command -v nginx   >/dev/null || { echo "!! nginx not found";   exit 1; }
[ -f "$LEAF" ]   || { echo "!! leaf cert not found: $LEAF"; exit 1; }
[ -f "$KEY_IN" ] || { echo "!! key not found: $KEY_IN"; exit 1; }

echo ">> validating the leaf certificate"
openssl x509 -in "$LEAF" -noout -subject -dates
if ! openssl x509 -in "$LEAF" -noout -checkend 0 >/dev/null; then
  echo "!! certificate has EXPIRED"; exit 1
fi

install -d -m 700 "$SSL_DIR"

# ---- 1. Build the certificate chain nginx will serve --------------------------
FULLCHAIN="$SSL_DIR/vendorcontracts.fullchain.crt"
if [ -n "$INTER" ] && [ -f "$INTER" ]; then
  echo ">> building fullchain (leaf + intermediate)"
  cat "$LEAF" "$INTER" > "$FULLCHAIN"
  if ! openssl verify -partial_chain -CAfile "$INTER" "$LEAF" >/dev/null 2>&1; then
    echo "   WARN: leaf did not verify against the supplied intermediate — double-check the bundle."
  fi
else
  echo ">> NO intermediate supplied — installing the leaf ONLY."
  echo "   Re-run with the RapidSSL TLS RSA CA G1 intermediate when you have it"
  echo "   (it shipped with your cert as a *.ca-bundle file) for a complete chain."
  cp "$LEAF" "$FULLCHAIN"
fi
chmod 644 "$FULLCHAIN"

# ---- 2. Decrypt the private key (interactive passphrase if encrypted) ---------
KEY_OUT="$SSL_DIR/vendorcontracts.key"
if head -1 "$KEY_IN" | grep -q "ENCRYPTED"; then
  echo ">> decrypting the private key — enter the passphrase when prompted"
  openssl pkey -in "$KEY_IN" -out "$KEY_OUT"   # writes an unencrypted PKCS#8 key
else
  echo ">> key is already unencrypted — copying as-is"
  cp "$KEY_IN" "$KEY_OUT"
fi
chmod 600 "$KEY_OUT"
chown root:root "$KEY_OUT"

# ---- 3. Verify the key matches the certificate --------------------------------
# NOTE: use `openssl rsa -modulus` for the KEY — `openssl pkey` has no -modulus
# option (it errors "Unknown cipher: modulus" and yields an empty digest, which
# looks like a false mismatch). `openssl x509 -modulus` is correct for the cert.
echo ">> verifying key matches certificate"
CRT_MOD="$(openssl x509 -in "$LEAF"    -noout -modulus | openssl md5)"
KEY_MOD="$(openssl rsa  -in "$KEY_OUT" -noout -modulus | openssl md5)"
if [ "$CRT_MOD" != "$KEY_MOD" ]; then
  echo "!! KEY DOES NOT MATCH CERT (modulus mismatch) — aborting, nginx untouched"
  echo "   cert: $CRT_MOD"
  echo "   key : $KEY_MOD"
  rm -f "$KEY_OUT"
  exit 1
fi
echo "   OK  key and certificate match"

# ---- 4. Locate + back up the existing site config -----------------------------
if [ -d /etc/nginx/sites-available ]; then
  CONF="/etc/nginx/sites-available/cms"
  ENABLED="/etc/nginx/sites-enabled/cms"
else
  CONF="/etc/nginx/conf.d/cms.conf"
  ENABLED=""
fi
if [ -f "$CONF" ]; then
  cp -a "$CONF" "$CONF.bak.$STAMP"
  echo ">> backed up existing config to $CONF.bak.$STAMP"
fi

# ---- 5. Write the HTTP->HTTPS + HTTPS server blocks ---------------------------
# `listen 443 ssl http2;` is the version-portable form (works on nginx < 1.25,
# where the standalone `http2 on;` directive does not exist).
echo ">> writing $CONF"
cat > "$CONF" <<NGINX
# Managed by setup-https.sh — CMS on ${DOMAIN}

# Redirect all plain HTTP to HTTPS.
# NOTE: if a load balancer UPSTREAM already terminates TLS and forwards plain
# HTTP to this box, delete this first server block to avoid a redirect loop and
# keep only the :443 block (or have the LB forward to :443).
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     ${FULLCHAIN};
    ssl_certificate_key ${KEY_OUT};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Security headers. The SPA is fully self-contained (offline), so a strict
    # same-origin policy holds. 'unsafe-inline' for styles is required by the
    # rich-text editor, which injects a <style> element at runtime.
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;

    root ${APP_ROOT};
    index index.html;

    # Uploaded contract documents can be large; allow big request bodies
    client_max_body_size 64m;

    # API + document downloads -> uvicorn
    location /api/ {
        proxy_pass http://${BACKEND};
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;    # extraction/report calls can be slow
    }

    # SPA fallback for client-side routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

# ---- 6. Enable + reload -------------------------------------------------------
if [ -n "$ENABLED" ]; then
  ln -sf "$CONF" "$ENABLED"
  rm -f /etc/nginx/sites-enabled/default
fi

echo ">> testing nginx configuration"
if ! nginx -t; then
  echo "!! nginx -t failed — restoring previous config"
  [ -f "$CONF.bak.$STAMP" ] && cp -a "$CONF.bak.$STAMP" "$CONF"
  exit 2
fi

echo ">> reloading nginx"
systemctl reload nginx || nginx -s reload

echo ">> verifying HTTPS locally"
if echo | openssl s_client -connect 127.0.0.1:443 -servername "${DOMAIN}" 2>/dev/null \
     | openssl x509 -noout -subject >/dev/null 2>&1; then
  echo "   OK  https is serving the certificate"
else
  echo "   WARN local https probe failed — check: journalctl -u nginx -n 30"
fi

echo
echo ">> done. HTTPS enabled for https://${DOMAIN}"
echo "   Verify the full chain from a CLIENT machine with:"
echo "     echo | openssl s_client -connect ${DOMAIN}:443 -servername ${DOMAIN} 2>/dev/null | grep 'Verify return code'"
[ -z "$INTER" ] && echo "   (Remember to re-run with the intermediate for a complete chain.)"
