import {expect,it,vi} from 'vitest';
import {socialFilters,socialReviewUrl,loadSocialReview} from './social-review';
function fixture(count=126) {
  const rows=Array.from({length:count},(_,id)=>({id}));
  const model=()=>({count:vi.fn(async()=>count),findMany:vi.fn(async({skip,take})=>rows.slice(skip,skip+take))});
  const tx={userBlock:model(),friendRequest:model()};
  return {...tx,$transaction:vi.fn(async fn=>fn(tx))};
}
it('normalizes unsafe pages, duplicate query fields and bounded search',()=>{
  expect(socialFilters({blocksPage:'-1',friendsPage:'99999999999999999999',blocksQ:['a','b'],friendsQ:'  Alice  '})).toEqual({blocksPage:1,friendsPage:1,blocksQ:'',friendsQ:'Alice'});
  expect(socialFilters({blocksQ:'a'.repeat(200)}).blocksQ).toHaveLength(120);
});
it('all records beyond 100 are reachable with bounded pages',async()=>{
  const db=fixture(),seen=[];
  for(let page=1;page<=6;page++){
    const result=await loadSocialReview(db,socialFilters({blocksPage:String(page),friendsPage:String(page)}));
    seen.push(...result.blocks.map(x=>x.id));expect(result.requests).toEqual(result.blocks);expect(result.blockTotal).toBe(126);
  }
  expect(seen).toHaveLength(126);expect(new Set(seen).size).toBe(126);
  expect(db.userBlock.findMany.mock.calls.every(([q])=>q.take===25)).toBe(true);
});
it('clamps high pages and keeps empty results on page one',async()=>{
  expect(await loadSocialReview(fixture(),socialFilters({blocksPage:'999'}))).toMatchObject({blocksPage:6,blockPages:6});
  expect(await loadSocialReview(fixture(0),socialFilters({blocksPage:'999'}))).toMatchObject({blocksPage:1,blockPages:1,blocks:[],blockTotal:0});
});
it('searches both sides case-insensitively and counts with the same filter',async()=>{
  const db=fixture();await loadSocialReview(db,socialFilters({blocksQ:'alice',friendsQ:'USR-1'}));
  const b=db.userBlock.findMany.mock.calls[0][0],f=db.friendRequest.findMany.mock.calls[0][0];
  expect(b.where.OR.map(x=>Object.keys(x)[0])).toEqual(['blocker','blocked']);
  expect(b.where.OR[0].blocker.OR[0].name).toEqual({contains:'alice',mode:'insensitive'});
  expect(f.where.OR.map(x=>Object.keys(x)[0])).toEqual(['requester','addressee','publicId']);
  expect(db.userBlock.count).toHaveBeenCalledWith({where:b.where});
  expect(db.friendRequest.count).toHaveBeenCalledWith({where:f.where});
  expect(b.orderBy).toEqual([{createdAt:'desc'},{blockerId:'asc'},{blockedId:'asc'}]);
  expect(f.orderBy).toEqual([{createdAt:'desc'},{id:'asc'}]);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'RepeatableRead'});
});
it('links preserve the other list state and safely encode search',()=>{
  const url=new URL(socialReviewUrl(socialFilters({blocksQ:'a & b',friendsQ:'c',friendsPage:'4'}),{blocksPage:2},'blocks'),'https://example.com');
  expect(url.searchParams.get('blocksQ')).toBe('a & b');expect(url.searchParams.get('friendsPage')).toBe('4');expect(url.hash).toBe('#blocks');
});
