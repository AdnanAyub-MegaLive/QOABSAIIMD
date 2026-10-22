export function moderationFilters(params){
 const type=params.get('type')||'ALL',status=params.get('status')||'ALL',page=Number(params.get('page')||1),q=(params.get('q')||'').trim();
 const from=params.get('from')?new Date(params.get('from')):null,to=params.get('to')?new Date(params.get('to')):null;
 if(!['ALL','KICK','BAN','SEAT_KICK'].includes(type)||!['ALL','ACTIVE','EXPIRED','REVOKED'].includes(status)||!Number.isSafeInteger(page)||page<1||page>100000||q.length>200||[from,to].some(d=>d&&!Number.isFinite(d.getTime()))||(from&&to&&from>to))throw Object.assign(new Error('Invalid moderation filters.'),{status:422});
 if(to&&/^\d{4}-\d{2}-\d{2}$/.test(params.get('to')))to.setUTCDate(to.getUTCDate()+1);
 return {type,status,page,q,from,to};
}
