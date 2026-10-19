import { normalizeSignupCountry } from './geo-country.js';
import { validateAgencyReference } from './agency-reference.js';
export async function selectedAgencyBd(db, publicId, country, actorId = null) {
 if (!publicId) throw Object.assign(new Error('Select the management supervisor for this agency.'),{code:'BD_REFERENCE_INVALID',status:422});
 const bd=validateAgencyReference(await db.user.findUnique({where:{publicId:String(publicId).trim()}}),country);
 if(actorId) {
  let current=bd; const seen=new Set(); let allowed=false;
  while(current&&!seen.has(current.id)) {
   seen.add(current.id);
   if(current.id===actorId){allowed=true;break;}
   current=current.supervisorUserId?await db.user.findUnique({where:{id:current.supervisorUserId}}):null;
  }
  if(bd.companyBdCountry||!allowed)throw Object.assign(new Error('Choose yourself or an eligible manager in your reporting team.'),{code:'BD_REFERENCE_INVALID',status:403});
 }
 return bd;
}
export async function companyBd(db, country) {
  const code=normalizeSignupCountry(country);
  if(!code)throw Object.assign(new Error('Agency country must be configured before company reassignment.'),{code:'TEAM_COUNTRY_MISMATCH',status:422});
  const user=await db.user.findUnique({where:{companyBdCountry:code}});
  if(!user||user.supervisorUserId||user.status!=='ACTIVE'||user.deletedAt)throw new Error('COMPANY_BD_NOT_CONFIGURED');
  return user;
}
