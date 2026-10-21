// Reuse authoritative country, role, status and block filtering; never accept
// a country from the mobile client as the source of directory eligibility.
export async function resellerDirectoryResponse(response, kind) {
  if (!response.ok) return response;
  const body = await response.json();
  const items = body.data.items.map(item => ({ ...item, ...(kind === "agents" ? { contact: { type: "CHAT", publicId: item.publicId } } : {}) }));
  return Response.json({ ...body, data: { ...body.data, items, [kind]: items } }, { status: response.status, headers: response.headers });
}
