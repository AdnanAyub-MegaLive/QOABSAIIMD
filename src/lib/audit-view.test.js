import {expect,it} from 'vitest';
import {auditFilters,auditRow,safeAuditDetails} from './audit-view.js';
it('redacts nested credentials, bank data and signed URL credentials',()=>{
 const result=safeAuditDetails({before:{passwordHash:'secret',bankDetails:{iban:'private'}},url:'https://x/a?displaySig=secret&v=1',note:'Bearer abc',count:4});
 expect(result.before.passwordHash).toBe('[REDACTED]');expect(result.before.bankDetails).toBe('[REDACTED]');expect(result.url).not.toContain('secret');expect(result.note).toBe('[REDACTED]');expect(result.count).toBe(4);
});
it('filters every category with UTC inclusive day boundaries',()=>{
 const result=auditFilters({category:'AGENCY_MANAGEMENT',from:'2026-10-19',to:'2026-10-19',action:'ASSIGNED',entity:'AGN-1'});
 expect(result.where.createdAt.gte.toISOString()).toBe('2026-10-19T00:00:00.000Z');expect(result.where.createdAt.lt.toISOString()).toBe('2026-10-20T00:00:00.000Z');expect(result.where.category).toBe('AGENCY_MANAGEMENT');
 expect(auditFilters({from:'invalid'}).where.createdAt).toBeUndefined();
});
it('does not invent system actors or outcomes for old records',()=>{
 const row={id:'1',createdAt:new Date(0),description:'Changed',metadata:{actorUserId:'user-1',outcome:'SUCCESS'}};
 expect(auditRow(row)).toMatchObject({adminName:'User / service actor',adminEmail:'user-1',outcome:'SUCCESS'});
 expect(auditRow({...row,metadata:null})).toMatchObject({adminName:'Unspecified actor',outcome:'Not recorded'});
});
