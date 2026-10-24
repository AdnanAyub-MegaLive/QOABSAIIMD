export const SOCIAL_PAGE_SIZE = 25;
export function socialFilters(params = {}) {
  const text = v => typeof v === 'string' ? v.trim().slice(0,120) : '';
  const page = v => /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) && Number(v)>0 ? Number(v) : 1;
  return {blocksQ:text(params.blocksQ),friendsQ:text(params.friendsQ),blocksPage:page(params.blocksPage),friendsPage:page(params.friendsPage)};
}
export function socialReviewUrl(filters,changes={},anchor='') {
  return `/content-moderation?${new URLSearchParams(Object.entries({...filters,...changes}).map(([k,v])=>[k,String(v)]))}${anchor?`#${anchor}`:''}`;
}
export async function loadSocialReview(db,filters) {
  const identity=q=>({OR:[{name:{contains:q,mode:'insensitive'}},{publicId:{contains:q,mode:'insensitive'}}]});
  const blockWhere=filters.blocksQ?{OR:[{blocker:identity(filters.blocksQ)},{blocked:identity(filters.blocksQ)}]}:{};
  const friendWhere=filters.friendsQ?{OR:[{requester:identity(filters.friendsQ)},{addressee:identity(filters.friendsQ)},{publicId:{contains:filters.friendsQ,mode:'insensitive'}}]}:{};
  return db.$transaction(async tx=>{
    const blockTotal=await tx.userBlock.count({where:blockWhere}),friendTotal=await tx.friendRequest.count({where:friendWhere});
    const pages=n=>Math.max(1,Math.ceil(n/SOCIAL_PAGE_SIZE));
    const blocksPage=Math.min(filters.blocksPage,pages(blockTotal)),friendsPage=Math.min(filters.friendsPage,pages(friendTotal));
    const person={select:{publicId:true,name:true}};
    const blocks=await tx.userBlock.findMany({where:blockWhere,include:{blocker:person,blocked:person},orderBy:[{createdAt:'desc'},{blockerId:'asc'},{blockedId:'asc'}],skip:(blocksPage-1)*SOCIAL_PAGE_SIZE,take:SOCIAL_PAGE_SIZE});
    const requests=await tx.friendRequest.findMany({where:friendWhere,include:{requester:person,addressee:person},orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(friendsPage-1)*SOCIAL_PAGE_SIZE,take:SOCIAL_PAGE_SIZE});
    return {blocks,requests,blockTotal,friendTotal,blocksPage,friendsPage,blockPages:pages(blockTotal),friendPages:pages(friendTotal)};
  },{isolationLevel:'RepeatableRead'});
}
