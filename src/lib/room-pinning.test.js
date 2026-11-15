import test from 'node:test';
import assert from 'node:assert/strict';
import { findPinnedRooms } from './room-pinning.js';

function fixture() {
  const calls=[];
  const model={async findMany(q) {
    calls.push(q);
    const scopes=q.where.AND[1].pinScope.in;
    return [{id:'busy',pinScope:'NONE'},{id:'local',pinScope:'COUNTRY'},{id:'global',pinScope:'GLOBAL'}].filter(r=>scopes.includes(r.pinScope)).slice(0,q.take);
  }};
  return {model,calls};
}
test('country pins precede unpinned rooms and global pins precede both',async()=>{
  const {model,calls}=fixture();const where={isBlocked:false,privacyMode:{not:'HIDDEN'}};
  const result=await findPinnedRooms(model,'PK',{where,take:3});
  assert.deepEqual(result.map(r=>r.id),['global','local','busy']);
  assert.ok(calls.every(q=>q.where.AND[0]===where));
});
test('pins are selected before limit, even if ordinary rooms are busy',async()=>{
  const {model,calls}=fixture();
  assert.deepEqual((await findPinnedRooms(model,'PK',{where:{},take:1})).map(r=>r.id),['global']);
  assert.equal(calls.length,1);
});
test('country pins have no special priority in worldwide listing',async()=>{
  const {model}=fixture();
  assert.deepEqual((await findPinnedRooms(model,null,{where:{},take:3})).map(r=>r.id),['global','busy','local']);
});
