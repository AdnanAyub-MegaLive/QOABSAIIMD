// Offsets are UTF-16 code units (Android/Kotlin String indices), end exclusive.
// Never guess a user's identity from a display name: duplicate names are valid.
const invalid = () => { throw Object.assign(new Error("Mentions must identify a current room member and match the message text."), {code:"VALIDATION_ERROR"}); };
export async function resolveRoomMentions(db, rawBody, input, participantIds) {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 20) invalid();
  if (!input.length) return [];
  const trim = rawBody.length - rawBody.trimStart().length;
  const body = rawBody.trim();
  const ranges = input.map(m => {
    if (!m || typeof m.publicId !== "string" || !Number.isSafeInteger(m.start) || !Number.isSafeInteger(m.end) || !participantIds.has(m.publicId)) invalid();
    const start = m.start - trim, end = m.end - trim;
    if (start < 0 || end <= start || end > body.length) invalid();
    return {publicId:m.publicId,start,end};
  }).sort((a,b)=>a.start-b.start);
  for(let i=1;i<ranges.length;i++)if(ranges[i].start<ranges[i-1].end)invalid();
  const users=await db.user.findMany({where:{publicId:{in:[...new Set(ranges.map(m=>m.publicId))]},status:"ACTIVE",deletedAt:null},select:{publicId:true,name:true}});
  const byId=new Map(users.map(u=>[u.publicId,u]));
  return ranges.map(m=>{
    const user=byId.get(m.publicId);
    if(!user || body.slice(m.start,m.end)!==`@${user.name}`)invalid();
    return {...m,name:user.name};
  });
}
export const messageMentions = message => Array.isArray(message.mentions) ? message.mentions : [];
