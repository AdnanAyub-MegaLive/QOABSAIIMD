#!/usr/bin/env bash
# Run as root on the Nginx droplet. Never generates credentials in the checkout.
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
test "$(id -u)" = 0 || { echo 'Run as root.' >&2; exit 1; }
test -f .env.local
dir=/root/megalive-admin-devices
test ! -e "$dir" || { echo "$dir already exists; refusing to replace credentials." >&2; exit 1; }
mkdir -m 700 "$dir"
openssl genrsa -aes256 -out "$dir/ca.key" 4096
openssl req -x509 -new -sha256 -days 3650 -key "$dir/ca.key" -out "$dir/ca.crt" \
  -subj '/CN=Mega Live Admin Devices CA' -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign'
printf '%s\n' 'basicConstraints=critical,CA:FALSE' 'keyUsage=critical,digitalSignature' 'extendedKeyUsage=clientAuth' > "$dir/client.ext"
for device in windows mac; do
  echo "Creating $device certificate. Choose an encrypted key password, then a P12 export password."
  openssl genrsa -aes256 -out "$dir/$device.key" 2048
  openssl req -new -key "$dir/$device.key" -out "$dir/$device.csr" -subj "/CN=Mega Live Super Admin $device"
  openssl x509 -req -in "$dir/$device.csr" -CA "$dir/ca.crt" -CAkey "$dir/ca.key" \
    -CAcreateserial -out "$dir/$device.crt" -days 365 -sha256 -extfile "$dir/client.ext"
  openssl pkcs12 -export -inkey "$dir/$device.key" -in "$dir/$device.crt" -certfile "$dir/ca.crt" \
    -out "$dir/$device.p12" -name "Mega Live Admin $device"
done
install -d -m 700 /etc/nginx/megalive-admin
install -m 600 "$dir/ca.crt" /etc/nginx/megalive-admin/ca.crt
openssl rand -hex 32 > "$dir/proxy-secret"
python3 - "$dir" <<'PY'
import pathlib, re, subprocess, sys
d = pathlib.Path(sys.argv[1])
secret = (d/'proxy-secret').read_text().strip()
fingerprints = []
for name in ('windows', 'mac'):
    out = subprocess.check_output(['openssl', 'x509', '-in', str(d/(name+'.crt')), '-noout', '-fingerprint', '-sha256'], text=True)
    fingerprints.append(out.strip().split('=', 1)[1].replace(':', ''))
p = pathlib.Path('.env.local')
text = p.read_text()
# Backup contains secrets, so keep it outside Git with root-only permissions.
(d/'env.local.before').write_text(text)
for key, value in {
    'SUPER_ADMIN_MTLS_ENABLED': 'false',
    'SUPER_ADMIN_MTLS_PROXY_SECRET': secret,
    'SUPER_ADMIN_MTLS_FINGERPRINTS': ','.join(fingerprints),
}.items():
    text = re.sub(r'^'+key+r'=.*\n?', '', text, flags=re.M)
    text = text.rstrip()+'\n'+key+'='+value+'\n'
p.write_text(text)
pathlib.Path('/etc/nginx/megalive-admin/tls.conf').write_text('''ssl_client_certificate /etc/nginx/megalive-admin/ca.crt;
ssl_verify_client optional;
ssl_verify_depth 2;
''')
pathlib.Path('/etc/nginx/megalive-admin/headers.conf').write_text('''proxy_set_header X-Mega-Client-Verify $ssl_client_verify;
proxy_set_header X-Mega-Client-Cert $ssl_client_escaped_cert;
proxy_set_header X-Mega-Mtls-Proxy-Secret "'''+secret+'''";
''')
PY
echo 'Prepared certificates and Nginx snippets. Restriction is OFF.'
echo 'Follow docs/super-admin-devices.md to install snippets, import both certificates, verify, then enable.'
