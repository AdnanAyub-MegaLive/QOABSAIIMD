import { describe, it, expect, vi } from 'vitest';
import { countryChatAccess, requireCountryChatSend } from './country-chat-access.js';
import { validateVipTier } from './vip-contract.js';
const member = () => ({ startsAt: new Date(Date.now()-60000), expiresAt: new Date(Date.now()+60000), tier: { active:true, level:3, privileges:['COUNTRY_CHAT'] }, disabledPrivileges:[] });
const db = row => ({vipMembership:{findUnique:vi.fn().mockResolvedValue(row)}});
describe('Country Chat VIP access',()=>{
 it.each([3,4,10])('allows eligible VIP %i',async level=>{const m=member();m.tier.level=level;expect((await countryChatAccess(db(m),'u')).canSend).toBe(true);});
 it.each(['none','low','expired','future','revoked','inactive','disabled','missing'])('rejects %s membership',async kind=>{let m=member();if(kind==='none')m=null;if(kind==='low')m.tier.level=2;if(kind==='expired')m.expiresAt=new Date(0);if(kind==='future')m.startsAt=new Date(Date.now()+60000);if(kind==='revoked')m.revokedAt=new Date();if(kind==='inactive')m.tier.active=false;if(kind==='disabled')m.disabledPrivileges=['COUNTRY_CHAT'];if(kind==='missing')m.tier.privileges=[];await expect(requireCountryChatSend(db(m),'u')).rejects.toMatchObject({code:'COUNTRY_CHAT_VIP_REQUIRED',status:403});expect((await countryChatAccess(db(m),'u')).sendRestriction).toContain('still read');});
 it('does not allow configuring this privilege below VIP 3',()=>{expect(()=>validateVipTier({name:'VIP',level:2,validDays:30,privileges:['COUNTRY_CHAT'],assets:[]})).toThrow('VIP level 3');});
});
