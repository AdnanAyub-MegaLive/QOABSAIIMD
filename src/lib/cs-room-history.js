export function csRoomMessageWhere({ country = "ALL", query = "" } = {}) {
  const where = {};
  if (country && country !== "ALL") where.country = country;
  const text = String(query ?? "").trim();
  if (text) {
    where.OR = [
      { body: { contains: text, mode: "insensitive" } },
      { publicId: { contains: text, mode: "insensitive" } },
      { sender: { is: { name: { contains: text, mode: "insensitive" } } } },
      { sender: { is: { publicId: { contains: text, mode: "insensitive" } } } },
    ];
  }
  return where;
}
