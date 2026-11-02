import { expect, it, vi } from 'vitest';
import { loadUserMessageHistory } from './portal-user-history.js';
import { effectiveAdmin } from './portal-staff-state.js';
const staff=permissions=>({active:true,role:'STAFF',permissions});
const database=()=>Object.fromEntries(['message','audioRoomMessage','notification'].map(name=>[name,{findMany:vi.fn(async()=>[{body:`sensitive ${name}`}])}]));

it('does not query or serialize any history for profile-only staff',async()=>{
 const db=database();
 expect(await loadUserMessageHistory(db,staff(['users.view','users.edit','rooms.view','notifications.view']),'user-1')).toEqual({messages:[],roomMessages:[],notifications:[]});
 for(const model of Object.values(db))expect(model.findMany).not.toHaveBeenCalled();
});
it('requires an additional notification grant even for message readers',async()=>{
 const db=database();const result=await loadUserMessageHistory(db,staff(['users.view','messages.view']),'user-1');
 expect(result.messages).toHaveLength(1);expect(result.roomMessages).toHaveLength(1);expect(result.notifications).toEqual([]);
 expect(db.notification.findMany).not.toHaveBeenCalled();
 expect(db.audioRoomMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{senderId:'user-1'}}));
});
it('allows explicit sensitive grants and active Platform Admin; denies inactive accounts',async()=>{
 for(const admin of [staff(['messages.view','notifications.view']),{active:true,role:'SUPER_ADMIN'}]) {
  const result=await loadUserMessageHistory(database(),admin,'user-1');expect(result.notifications).toHaveLength(1);
 }
 const db=database();await loadUserMessageHistory(db,{active:false,role:'SUPER_ADMIN'},'user-1');
 expect(db.message.findMany).not.toHaveBeenCalled();
});
it('stops querying after a manager loses the sensitive grant',async()=>{
 const rows={child:{id:'child',...staff(['users.view','messages.view']),createdById:'manager'},manager:{id:'manager',...staff(['users.view','messages.view'])}};
 const db={...database(),admin:{findUnique:async({where})=>rows[where.id]}};
 await loadUserMessageHistory(db,await effectiveAdmin(db,'child'),'user-1');
 rows.manager.permissions=['users.view'];db.message.findMany.mockClear();db.audioRoomMessage.findMany.mockClear();
 expect((await loadUserMessageHistory(db,await effectiveAdmin(db,'child'),'user-1')).messages).toEqual([]);
 expect(db.message.findMany).not.toHaveBeenCalled();expect(db.audioRoomMessage.findMany).not.toHaveBeenCalled();
});
