import bcrypt from 'bcrypt';
import {timingSafeEqual} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {requirePortalAdmin} from '@/lib/portal-admin';
import {isDatabaseOwner} from '@/lib/database-management-access';
import {databaseTables,databaseDeletionPlan,sealDatabasePreview,openDatabasePreview,executeDatabaseDeletion} from '@/lib/database-management';
import {sameOrigin,jsonBody} from '@/lib/game-control/http';
import {isRateLimited} from '@/lib/rate-limit';
const fail=(message,status,code)=>Object.assign(new Error(message),{status,code});
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function owner(){const admin=await requirePortalAdmin();if(!isDatabaseOwner(admin))throw fail('This section is restricted to the configured Platform Admin.',403,'FORBIDDEN');return admin;}
function errorResponse(error){return json({success:false,error:{code:error.code&&error.status?error.code:'DATABASE_OPERATION_FAILED',message:error.status?error.message:'Operation refused or failed. No partial deletion was committed.'}},error.status??409);}
export async function GET(){try{await owner();return json({success:true,data:{tables:await databaseTables(prisma)}});}catch(e){return errorResponse(e);}}
export async function POST(request){try{
 sameOrigin(request);const admin=await owner();
 if(isRateLimited(`database-management:${admin.id}`,{limit:10,windowMs:60000}))throw fail('Please wait before trying again.',429,'RATE_LIMITED');
 const body=await jsonBody(request);
 if(body.action==='PREVIEW'){
   const plan=await prisma.$transaction(tx=>databaseDeletionPlan(tx,body),{isolationLevel:'RepeatableRead',timeout:60000});
   const token=sealDatabasePreview({adminId:admin.id,sessionVersion:admin.sessionVersion,scope:plan.scope,fingerprint:plan.fingerprint,expiresAt:Date.now()+300000});
   return json({success:true,data:{token,counts:plan.counts,total:plan.total,confirmation:`PERMANENTLY DELETE ${plan.total} RECORDS`}});
 }
 if(body.action!=='DELETE')throw fail('Unknown action.',422,'VALIDATION_ERROR');
 if(process.env.DATABASE_MANAGEMENT_DELETE_ENABLED!=='true')throw fail('Permanent deletion is not enabled on this deployment. Set DATABASE_MANAGEMENT_DELETE_ENABLED=true after validating an isolated database.','DELETION_DISABLED',503);
 const payload=openDatabasePreview(body.token,admin.id);
 const plan=await prisma.$transaction(tx=>databaseDeletionPlan(tx,payload.scope),{isolationLevel:'RepeatableRead',timeout:60000});
 if(plan.fingerprint!==payload.fingerprint)throw fail('Data changed. Generate a fresh preview.',409,'PREVIEW_STALE');
 if(body.confirmation!==`PERMANENTLY DELETE ${plan.total} RECORDS`)throw fail('Type the exact confirmation phrase.',422,'CONFIRMATION_REQUIRED');
 const record=await prisma.admin.findUnique({where:{id:admin.id}});
 if(!isDatabaseOwner(record)||record.sessionVersion!==admin.sessionVersion)throw fail('Session changed. Sign in again.',403,'FORBIDDEN');
 const password=typeof body.password==='string'?body.password:'';
 if(!password||password.length>72)throw fail('Your current password is required.',403,'PASSWORD_REQUIRED');
 let valid=false;
 if(record.passwordHash==='ENV_AUTH_PENDING_HASH_MIGRATION'){
   const a=Buffer.from(password),b=Buffer.from(process.env.ADMIN_PASSWORD??'');valid=a.length===b.length&&b.length>0&&timingSafeEqual(a,b);
 }else valid=await bcrypt.compare(password,record.passwordHash).catch(()=>false);
 if(!valid)throw fail('Password verification failed.',403,'PASSWORD_REQUIRED');
 return json({success:true,data:await executeDatabaseDeletion(prisma,payload)});
}catch(e){return errorResponse(e);}}
