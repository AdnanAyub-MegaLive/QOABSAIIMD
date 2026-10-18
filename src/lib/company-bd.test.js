import {expect,it,vi} from 'vitest';
import {selectedAgencyBd,companyBd} from './company-bd.js';
const users=[{id:'admin',publicId:'USR-A',country:'PK',appRoles:['ADMIN'],status:'ACTIVE'},{id:'bd',publicId:'USR-B',country:'PK',appRoles:['BD'],status:'ACTIVE',supervisorUserId:'admin'},{id:'company',publicId:'COMPANY-BD-PK',country:'PK',companyBdCountry:'PK',appRoles:['BD'],status:'ACTIVE'}];
const db={user:{findUnique:vi.fn(async({where})=>users.find(u=>Object.entries(where).every(([k,v])=>u[k]===v)))}};
it('requires a BD selection and permits a downstream BD',async()=>{
 await expect(selectedAgencyBd(db,null,'PK','admin')).rejects.toMatchObject({code:'BD_REFERENCE_INVALID'});
 expect((await selectedAgencyBd(db,'USR-B','PK','admin')).id).toBe('bd');
 await expect(selectedAgencyBd(db,'USR-A','PK')).rejects.toMatchObject({code:'BD_REFERENCE_INVALID'});
});
it('Company remains outside every personal chain',async()=>{
 await expect(selectedAgencyBd(db,'COMPANY-BD-PK','PK','admin')).rejects.toMatchObject({status:403});
 expect((await companyBd(db,'Pakistan')).id).toBe('company');
 expect((await selectedAgencyBd(db,'COMPANY-BD-PK','PK')).id).toBe('company');
});
it('rejects foreign country and unrelated BD',async()=>{
 await expect(selectedAgencyBd(db,'USR-B','US','admin')).rejects.toMatchObject({code:'BD_REFERENCE_INVALID'});
 await expect(selectedAgencyBd(db,'USR-B','PK','unrelated')).rejects.toMatchObject({status:403});
});
