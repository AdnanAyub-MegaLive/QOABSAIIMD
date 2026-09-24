export function normalizeRoomPassword(value, { allowEmpty = false } = {}) {
  const password = String(value ?? "").trim();
  if (allowEmpty && !password) return null;
  if (!/^\d{4,6}$/.test(password)) {
    const error = new Error("Room password must contain 4 to 6 digits.");
    error.code = "ROOM_PASSWORD_INVALID_FORMAT";
    throw error;
  }
  return password;
}

export function canSendLockedRoomMessage(room, userId) {
  return !room.chatLocked || room.ownerId === userId || Boolean(room.seats?.length);
}

export function roomControlError(code) {
  const messages = {
    ROOM_PASSWORD_REQUIRED: "A room password is required.",
    ROOM_PASSWORD_INVALID: "The room password is incorrect.",
    ROOM_PASSWORD_INVALID_FORMAT: "Room password must contain 4 to 6 digits.",
    CHAT_LOCKED: "The room public screen is locked.",
    ROOM_OWNER_REQUIRED: "Only the room owner can perform this action.",
    JOIN_ROOM_FIRST: "Join this room before performing this action.",
  };
  return { success: false, error: { code, message: messages[code] ?? "Unable to update this room." } };
}
