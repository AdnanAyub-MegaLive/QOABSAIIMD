# Public Android downloads

Uploads → Other Assets → APK lets staff with `uploads.manage` upload releases and enable/disable their links. `uploads.view` permits listing and copying links. Changes are audited. No schema migration is needed.

Upload a signed, tested release APK, maximum 250 MiB. The server checks APK filename and ZIP package structure (AndroidManifest.xml); this is not certificate verification or malware scanning. It never extracts or executes APK contents. Scan and sign builds before upload.

The public `/api/apk-downloads/APK-<uuid>` URL requires no login and does not expire. It stops working when disabled. Files are attachments with Android package MIME and nosniff; responses are not cached so disabled releases cannot continue to be downloaded from an HTTP cache. Already downloaded copies cannot be revoked.

Releases are stored in UploadAsset, separate from mobile props/catalogues, and currently served by the portal rather than mirrored to the public artwork CDN. Each upload produces a new immutable link. Retain database backups accordingly.

Production: configure the reverse proxy request body limit to at least 251 MiB (for example `client_max_body_size 251m` in Nginx), sufficient request timeout, and any upstream CDN upload limits. The application itself enforces 250 MiB per file and 251 MiB multipart body. `AUTH_URL` must match the browser's public portal origin. No proxy configuration is changed by this feature.
