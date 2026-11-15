// Apply pin priority before the directory limit; never bypass visibility filters.
export async function findPinnedRooms(model, country, query) {
  const groups = country ? [["GLOBAL"], ["COUNTRY"], ["NONE"]] : [["GLOBAL"], ["NONE", "COUNTRY"]];
  const rooms = [];
  for (const scopes of groups) {
    const remaining = query.take - rooms.length;
    if (remaining <= 0) break;
    rooms.push(...await model.findMany({ ...query, where: { AND: [query.where, { pinScope: { in: scopes } }] }, take: remaining }));
  }
  return rooms;
}
