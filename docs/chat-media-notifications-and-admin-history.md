# Specs 209 and 210

Photo/video sends and chat gifts no longer insert `CHAT_MESSAGE` notifications. Chat messages, receipts, unread state and existing realtime delivery remain. No new offline push service was introduced; the text/voice paths are unchanged.

The notification list and unread count also exclude this type, including when explicitly requested with `types`. Migration `20261112090000_remove_chat_message_notifications` deletes existing rows of that type and their cascading read records. It does not delete messages or other notification types. Cleanup takes effect on the deployed database when migrations run.

Portal Messages now supports a `kind` filter (text, voice, picture, video, gift), preserving search/category/pagination. Room and system rows remain text. Voice has duration and an audio player; pictures open full size; videos have controls and available posters; gifts show artwork, name, quantity and recipient. Deleted rows display who deleted them and when. Storage retention is unchanged: purged files cannot be recovered by this feature.

`GET /api/admin/messages/{messagePublicId}/voice` and `/media` require a Portal session with `messages.view`. They proxy private storage without exposing keys, audit access, disable caching and support media Range requests. `/media?poster=1` serves a video poster through the same permission/audit boundary. Retained deleted media is available only to admins through these routes; participant routes remain unchanged.

Deploy on the Droplet:

```bash
cd /root/apps/QOABSAIIMD &&
git pull --ff-only origin main &&
bash scripts/deploy-droplet.sh
```

The deployment script applies the cleanup migration automatically. No app release or event-template republish is required for these changes.
