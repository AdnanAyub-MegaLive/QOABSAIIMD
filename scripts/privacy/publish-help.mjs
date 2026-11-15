// Publish deletion instructions through the existing Help Center, including installed versions.
import {existsSync} from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const {prisma}=await import('../../src/lib/prisma.js');
try {
 await prisma.$transaction(async tx=>{
 const data={type:'GUIDE',slug:'account-and-data-deletion',language:'en',title:'Delete account and personal data',summary:'Request permanent deletion of your Mega Live account',icon:'🔒',published:true,sortOrder:0,sections:[{heading:'Request deletion',body:'Email support@megalive.live with subject Mega Live account deletion request. Include your user ID and send from the linked email if possible. Never send passwords or verification codes. Instructions: https://portal.megachat.live/account-deletion.html'},{heading:'Verification and timing',body:'Support verifies ownership and processes requests within five business days. Pending payments or disputes may require reconciliation; support will explain any delay and confirm completion.'},{heading:'Data removed and retained',body:'Personal identity, credentials, owned content, activity and app-hosted personal media are removed. De-identified transaction amounts remain for accounting and fraud prevention. Restricted database backups and technical logs expire within 30 days. Copies independently saved by other users cannot be removed from their devices.'}]};
 await tx.helpEntry.upsert({where:{slug_language:{slug:data.slug,language:'en'}},create:data,update:data});
 await tx.helpSettings.update({where:{id:'GLOBAL'},data:{supportEmail:'support@megalive.live',privacyUrl:'https://portal.megachat.live/privacy-policy.html'}});
 await tx.auditLog.create({data:{action:'DELETION_HELP_PUBLISHED',category:'CONTENT_MANAGEMENT',entityType:'HelpCenter',entityId:'account-and-data-deletion',description:'Published verified account deletion instructions and current privacy policy.'}});
 });
 console.log('Deletion guide and privacy URL published.');
}finally{await prisma.$disconnect();}
