# Super Admin: Windows and Mac certificates

This restricts **all SUPER_ADMIN accounts** in the main and Events portals. Other roles keep ordinary login without certificates. Public event pages and mobile APIs are unaffected. Passwords are still required. Every authenticated request is checked, so an existing session alone cannot bypass the restriction. Sessions can be used on either approved device; this is not a two-concurrent-sessions limit.

`TRUST_PROXY_GEO_HEADERS` is unrelated: leave it `false`. `TRUSTED_PROXY_IPS` lists immediate reverse proxies, not approved devices. For Nginx connecting locally to Node, use `127.0.0.1,::1` only if those are the actual socket peers. Device enforcement uses a separate private proxy secret and two SHA-256 certificate fingerprints.

## 1. Droplet: deploy and prepare

Keep your SSH session open through testing. Replace `DROPLET_IP` in device commands with your Droplet's SSH address.

```bash
cd /root/apps/QOABSAIIMD &&
git pull --ff-only origin main &&
bash scripts/deploy-droplet.sh &&
bash scripts/setup-super-admin-devices.sh
```

OpenSSL prompts for the CA key password, separate device key passwords, and P12 export passwords. Save these in your password manager. The CA password is requested again when signing each device. No password belongs in a shell command or Git. The script refuses to replace an existing `/root/megalive-admin-devices` directory; do not delete it merely to rerun setup. It creates one-year device certificates and leaves enforcement **off**.

Find and edit the **existing** HTTPS server block for `portal.megachat.live` (do not create a duplicate):

```bash
grep -R -n 'server_name.*portal.megachat.live' /etc/nginx/sites-enabled /etc/nginx/conf.d
# Replace this with the actual file found above:
sudoedit /etc/nginx/sites-available/YOUR_PORTAL_CONFIG
```

Inside its HTTPS `server { ... }`, add:

```nginx
include /etc/nginx/megalive-admin/tls.conf;
```

Inside **every `location` that proxies to this application**, alongside its existing `proxy_set_header` directives, add:

```nginx
include /etc/nginx/megalive-admin/headers.conf;
```

Keep the existing Host, forwarded-protocol, WebSocket and other proxy settings. Include the headers in each proxying location because Nginx header inheritance can otherwise omit them. Do not use `ssl_verify_client on`: that would also block staff. The generated configuration uses `optional`. Ensure your app port (usually 3000) is not publicly exposed: bind the upstream to loopback or restrict it with your existing firewall. Do not publish the generated proxy secret or full `nginx -T` output.

```bash
nginx -t && systemctl reload nginx
cd /root/apps/QOABSAIIMD
pm2 restart megalive-portal --update-env
```

## 2. Windows: import Windows certificate

Run PowerShell as your normal Windows user:

```powershell
scp root@DROPLET_IP:/root/megalive-admin-devices/windows.p12 "$env:USERPROFILE\Downloads\megalive-windows.p12"
$devicePassword = Read-Host 'Windows P12 export password' -AsSecureString
Import-PfxCertificate -FilePath "$env:USERPROFILE\Downloads\megalive-windows.p12" -CertStoreLocation Cert:\CurrentUser\My -Password $devicePassword
Remove-Variable devicePassword
Start-Process 'https://portal.megachat.live/api/auth/device-status'
```

Use Edge or Chrome. If necessary, fully exit and reopen the browser, then select **Mega Live Super Admin windows** when prompted. The JSON must show `"approvedDevice":true`. The imported private key is non-exportable by default because the command does not use `-Exportable`. Firefox may need a separate browser certificate import. Do not install the CA as a trusted website root on either device; it is only for Nginx client authentication.

## 3. Mac: import Mac certificate

Run Terminal on the Mac:

```bash
scp root@DROPLET_IP:/root/megalive-admin-devices/mac.p12 ~/Downloads/megalive-mac.p12
open ~/Downloads/megalive-mac.p12
```

Import into your **login** keychain with the Mac P12 export password. Use Keychain Access's import dialog if double-click import does not open. Keep normal trust settings; do not set the CA to Always Trust. Restart Safari or Chrome, then:

```bash
open 'https://portal.megachat.live/api/auth/device-status'
```

Select **Mega Live Super Admin mac** if prompted. Confirm `"approvedDevice":true` on this Mac too.

## 4. Droplet: activate only after BOTH checks pass

```bash
cd /root/apps/QOABSAIIMD &&
node scripts/set-super-admin-devices.mjs enable &&
pm2 restart megalive-portal --update-env &&
pm2 save
```

Check device-status now reports `"enabled":true` and `"approvedDevice":true` on both computers. Log into the main portal and `/events-login` as Super Admin on both. From a third device without a certificate, Super Admin must fail but a normal staff account must still work. This also checks Nginx location coverage. An invalid certificate explicitly offered by a browser can be rejected by Nginx; normal staff should offer no certificate.

If PM2 or a service explicitly sets these same environment variables, remove that duplicate configuration first: process environment takes precedence over `.env.local`. Never enable the restriction before both browser checks pass.

## Recovery, revocation and renewal

Emergency recovery through SSH:

```bash
cd /root/apps/QOABSAIIMD &&
node scripts/set-super-admin-devices.mjs disable &&
pm2 restart megalive-portal --update-env
```

Disabling restores password-only Super Admin access. To revoke one device without disabling the policy, remove only its fingerprint from `SUPER_ADMIN_MTLS_FINGERPRINTS` in `.env.local`, then restart PM2. The policy accepts one or two fingerprints; the initial activation script requires two distinct fingerprints. Removing a fingerprint blocks existing sessions on that device too.

Renew certificates before the one-year expiration. Sign a new device certificate with the saved encrypted CA key, import its P12 on that device and replace its fingerprint; do not expand the allowlist beyond two. The existing encrypted CA and device keys remain in the root-only directory for recovery. The `.p12` files are password-protected but transferable: this is certificate-based access, not hardware attestation. Anyone with a copied P12 and its password has that device's credential. Keep an encrypted offline backup, then remove transfer copies from Downloads and the Droplet when imports are confirmed. Never commit credentials or share them in chat.

References: [Nginx client verification](https://nginx.org/en/docs/http/ngx_http_ssl_module.html#ssl_verify_client), [Nginx proxy headers](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header), [Apple Keychain import](https://support.apple.com/en-ie/guide/keychain-access/kyca2431/mac).
