import dotenv from 'dotenv';
dotenv.config({path:'.env.local',quiet:true});
const {prisma:p}=await import('../src/lib/prisma.js');
const {default:sessions}=await import('../src/lib/mobile-session.cjs');
const {default:sharp}=await import('sharp');
const {randomUUID}=await import('node:crypto');
const users=[]; let room;
const report=[];
async function request(user,path,options={}) {
 const response=await fetch(`https://portal.megachat.live${path}`,{...options,headers:{authorization:`Bearer ${sessions.createMobileSessionToken(user)}`,...options.headers},signal:AbortSignal.timeout(120000)});
 const text=await response.text(); let body;try{body=JSON.parse(text)}catch{body={nonJson:true}};
 return {status:response.status,body};
}
function record(name,result){report.push({name,status:result.status,code:result.body.error?.code,message:result.body.error?.message,nonJson:result.body.nonJson});console.log(JSON.stringify(report.at(-1)));}
try {
 if(process.argv.includes('--audit')){
  const rows=await p.user.findMany({where:{name:{startsWith:'QA VIP/banner '}},select:{publicId:true,coinBalance:true,deletedAt:true}});
  console.log(JSON.stringify({qaAccounts:rows.length,allQaBalancesZero:rows.every(u=>u.coinBalance===0n),allQaAccountsDisabled:rows.every(u=>u.deletedAt),activeQaBanners:await p.roomBanner.count({where:{owner:{name:{startsWith:'QA VIP/banner '}},status:{in:['PENDING','ACTIVE']}}}),temporaryTierCount:await p.vipTier.count({where:{name:{startsWith:'QA temporary visitor VIP '}}})}));
 }
 console.log(JSON.stringify({settings:await p.roomBannerSettings.findUnique({where:{id:'default'}}),tiers:await p.vipTier.findMany({select:{id:true,level:true,active:true,privileges:true},orderBy:{level:'asc'}}),migrations:await p.$queryRaw`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 3`}));
 if(process.argv.includes('--test')){
  process.env.MOBILE_SESSION_TTL_SECONDS='300';
  for(let i=0;i<2;i++)users.push(await p.user.create({data:{publicId:`USR-QA-${randomUUID()}`,name:'QA profile/banner verification',coinBalance:0n}}));
  const [a,b]=users;
  console.log(JSON.stringify({testAccounts:users.map(u=>u.publicId)}));
  await p.userProfileVisit.create({data:{targetId:a.id,visitorId:b.id}});
  record('No VIP own visitors',await request(a,`/api/v1/users/${a.publicId}/visitors`));
  record('No VIP cursor denial',await request(a,`/api/v1/users/${a.publicId}/visitors?cursor=invalid`));
  record('Other account visitors',await request(b,`/api/v1/users/${a.publicId}/visitors`));
  const tier=await p.vipTier.findFirst({where:{active:true,level:1}});
  if(tier){await p.vipMembership.create({data:{userId:a.id,tierId:tier.id,expiresAt:new Date(Date.now()+600000)}});record('Active VIP 1 visitors',await request(a,`/api/v1/users/${a.publicId}/visitors`));await p.vipMembership.update({where:{userId:a.id},data:{expiresAt:new Date(0)}});record('Expired VIP visitors',await request(a,`/api/v1/users/${a.publicId}/visitors`));}
  record('Followers unaffected',await request(a,`/api/v1/users/${a.publicId}/followers`));
  room=await p.audioRoom.create({data:{roomId:`ROOM-QA-${randomUUID()}`,ownerId:a.id,title:'Private QA banners',status:'IDLE',privacyMode:'HIDDEN'}});
  record('Owner banner settings',await request(a,`/api/v1/audio-rooms/${room.roomId}/banners`));
  record('Non-owner banner delete',await request(b,`/api/v1/audio-rooms/${room.roomId}/banners`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({bannerId:'test'})}));
  const gif=await sharp(Buffer.from([255,0,0,0,255,0]),{raw:{width:1,height:2,channels:3,pageHeight:1}}).gif({delay:[100,100],loop:0}).toBuffer();
  const form=new FormData();form.append('image',new File([gif],'qa.gif',{type:'image/gif'}));form.append('requestId',randomUUID());form.append('packageId','unconfigured');form.append('settingsRevision','0');
  record('Disabled banner upload',await request(a,`/api/v1/audio-rooms/${room.roomId}/banners`,{method:'POST',body:form}));
  for(const path of ['avatar','cover','covers']){
   const bytes=Buffer.concat([gif,Buffer.alloc(25*1024*1024-gif.length)]),form=new FormData();form.append('image',new File([bytes],'qa-25mb.gif',{type:'image/gif'}));
   const result=await request(a,`/api/v1/users/me/${path}`,{method:'POST',body:form});record(`25 MB GIF ${path}`,result);
   if(path==='avatar'&&result.body.data?.profileImage){const r=await fetch(result.body.data.profileImage);const bytes=Buffer.from(await r.arrayBuffer());const meta=await sharp(bytes,{animated:true}).metadata();console.log(JSON.stringify({avatarMediaStatus:r.status,format:meta.format,frames:meta.pages}));}
   const over=new FormData();over.append('image',new File([Buffer.alloc(25*1024*1024+1)],'over.gif',{type:'image/gif'}));record(`Over 25 MB ${path}`,await request(a,`/api/v1/users/me/${path}`,{method:'POST',body:over}));
  }
  console.log(JSON.stringify({testBalances:(await p.user.findMany({where:{id:{in:users.map(u=>u.id)}},select:{publicId:true,coinBalance:true}})).map(u=>({...u,coinBalance:String(u.coinBalance)}))}));
 }
} finally {
 for(const user of users){
  await p.profileCover.deleteMany({where:{userId:user.id}});await p.profileCoverItem.deleteMany({where:{userId:user.id}});
  await p.vipMembership.deleteMany({where:{userId:user.id}});await p.uploadAssetAssignment.deleteMany({where:{userId:user.id,source:{in:['VIP','VIP_TIER']}}});
  await p.user.update({where:{id:user.id},data:{status:'INACTIVE',profileImage:null,sessionVersion:{increment:1},vipLevel:0}}).catch(async()=>{await p.user.update({where:{id:user.id},data:{deletedAt:new Date(),sessionVersion:{increment:1},profileImage:null,vipLevel:0}})});
 }
 if(room)await p.audioRoom.update({where:{id:room.id},data:{status:'ENDED'}});
 await p.$disconnect();
}
