import { expect, it, vi } from 'vitest';
import { changeProfileRelationship } from './profile-relationships.js';

it.each([
  ['a','c','You already have a CP.'],
  ['c','b','This person already has a CP.'],
])('refuses a request before creating a relationship or inbox message (%s, %s)',async(leftUserId,rightUserId,message)=>{
  const upsert=vi.fn();
  const tx={
    $queryRaw:vi.fn(), user:{findUnique:async()=>({id:'b'}),findMany:async()=>[{id:'a'},{id:'b'}]},
    userBlock:{findFirst:async()=>null},
    profileRelationship:{findMany:async()=>[{leftUserId,rightUserId}],upsert},
  };
  await expect(changeProfileRelationship({$transaction:run=>run(tx)},'a',{type:'CP',action:'REQUEST',userPublicId:'B'}))
    .rejects.toMatchObject({code:'RELATIONSHIP_LIMIT_REACHED',status:409,message});
  expect(upsert).not.toHaveBeenCalled();
});
