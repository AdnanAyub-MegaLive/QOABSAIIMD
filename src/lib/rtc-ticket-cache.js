export function createRtcTicketCache() {
  const tickets = new Map();
  return async (key, issue) => {
    const now = Date.now(), existing = tickets.get(key);
    if(existing && Date.parse(existing.expiresAt) > now + 30000)return existing;
    const ticket = await issue();
    if(ticket?.expiresAt)tickets.set(key,ticket);
    for(const[k,value]of tickets)if(Date.parse(value.expiresAt)<=now)tickets.delete(k);
    if(tickets.size>5000)tickets.delete(tickets.keys().next().value);
    return ticket;
  };
}
