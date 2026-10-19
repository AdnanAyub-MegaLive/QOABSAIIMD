import {expect,it,vi} from 'vitest';
import {BUSINESS_MANAGEMENT_ROLES,canOwnMultipleAgencies,ownedAgencySelection} from './agency-ownership.js';
it('allows multiple ownership for business managers but not company accounts',()=>{
 for(const role of BUSINESS_MANAGEMENT_ROLES)expect(canOwnMultipleAgencies({appRoles:[role]})).toBe(true);
 for(const role of ['USER','HOST','CS','CS_LEADER'])expect(canOwnMultipleAgencies({appRoles:[role]})).toBe(false);
 expect(canOwnMultipleAgencies({appRoles:['BD'],companyBdCountry:'PK'})).toBe(false);
});
it('requires selection and filters by authenticated owner',async()=>{
 const findMany=vi.fn().mockResolvedValue([{id:'1'},{id:'2'}]);const db={agency:{findMany}};
 await expect(ownedAgencySelection(db,'owner')).rejects.toMatchObject({code:'AGENCY_SELECTION_REQUIRED'});
 findMany.mockResolvedValue([]);
 await expect(ownedAgencySelection(db,'owner','AGN-other')).rejects.toMatchObject({code:'AGENCY_NOT_FOUND'});
 expect(findMany.mock.lastCall[0].where).toEqual({ownerUserId:'owner',publicId:'AGN-other'});
 findMany.mockResolvedValue([{id:'1'}]);expect(await ownedAgencySelection(db,'owner')).toEqual({id:'1'});
});
