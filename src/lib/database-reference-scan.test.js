import {expect,it} from 'vitest';
import {containsDatabaseReference as matches} from './database-reference-scan.js';
it('finds nested JSON, arrays, keys, URL and prose identifiers',()=>{
 const ids=new Set(['USR-123','2030140']);
 for(const value of [{data:{senderId:'2030140'}},{users:['USR-123']},{'USR-123':{}},'Sent by USR-123.', 'https://portal.test/users/2030140', 'user:2030140'])expect(matches(value,ids)).toBe(true);
});
it('does not match partial identifiers, amounts, or display names',()=>{
 const ids=new Set(['USR-123','2030140']);
 for(const value of ['USR-1234','xUSR-123','USR-123-x',{coins:2030140},{body:'2030140 coins'},'Alice'])expect(matches(value,ids)).toBe(false);
});
