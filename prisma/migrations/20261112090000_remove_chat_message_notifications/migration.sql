-- Chat receipts and realtime events remain the source of chat unread state.
DELETE FROM "Notification" WHERE "type" = 'CHAT_MESSAGE';
