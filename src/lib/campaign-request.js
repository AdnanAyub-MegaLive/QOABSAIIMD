export function campaignRequestKey(userId, roomId, requestId) {
  return `${userId}:${roomId}:${requestId}`;
}

export async function campaignTransaction(db, work) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: "Serializable" }); }
    catch (error) { if (error?.code !== "P2034" || attempt === 2) throw error; }
  }
}
