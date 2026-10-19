export const BUSINESS_MANAGEMENT_ROLES = ['BD','ADMIN','JUNIOR_ADMIN','SENIOR_ADMIN','SUPER_ADMIN','COUNTRY_HEAD','MANAGER'];
export function canOwnMultipleAgencies(user) {
  return !user?.companyBdCountry && BUSINESS_MANAGEMENT_ROLES.some(role=>user?.appRoles?.includes(role));
}
// Old clients may omit agencyId only when ownership is unambiguous.
export async function ownedAgencySelection(db, userId, publicId) {
  const rows=await db.agency.findMany({where:{ownerUserId:userId,...(publicId?{publicId:String(publicId)}:{})},select:{id:true,publicId:true,name:true,status:true},orderBy:{publicId:'asc'},...(publicId?{}:{take:2})});
  if(rows.length>1)throw Object.assign(new Error('Select which agency to manage using agencyId.'),{code:'AGENCY_SELECTION_REQUIRED',status:422});
  if(publicId&&!rows.length)throw Object.assign(new Error('You do not own this agency.'),{code:'AGENCY_NOT_FOUND',status:404});
  return rows[0]??null;
}
