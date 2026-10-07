# Chat retention

The custom portal server permanently deletes Message and AudioRoomMessage records older than 30 × 24 hours, based on original createdAt (editing does not extend retention). This includes world, group, direct and audio-room chat, including soft-deleted/cleared messages. MessageReceipt rows cascade with Message deletion. Conversation membership remains; lastMessageAt is recalculated.

System Notification and NotificationRead records are excluded. Other domains such as posts, moderation audit records and financial records are not chat messages and are unaffected.

Cleanup runs on server startup and every five minutes in bounded batches, without overlapping runs. Large historical backlogs may take multiple runs. It requires the persistent `node server.js` process, not a serverless-only Next deployment. Failures are logged and retried next run.

All portal and profile message views read these same tables, so deletion affects them too. This is permanent database deletion, not just hiding records. Already-downloaded mobile caches and database backups are outside this cleanup: mobile clients should expire cached chat by createdAt after 30 days and refresh history; they must not expire system notifications.

Apply migration `20261007210000_message_retention_index` and restart the custom server to activate cleanup. No production cleanup was run during implementation tests.
