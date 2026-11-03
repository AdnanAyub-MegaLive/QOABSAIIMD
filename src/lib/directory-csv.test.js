import { expect,it,vi } from 'vitest';
import { csvCell,exportFilters,directoryCsv } from './directory-csv.js';
it('quotes CSV and neutralizes formula injection',()=>{
 expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
 for(const text of ['=SUM(1,2)',' +1','@user','\tformula'])expect(csvCell(text)).toMatch(/^"'/);
 expect(csvCell('9007199254740993000')).toBe('"9007199254740993000"');
});
it('rejects invalid dates, oversized intervals and invalid modules',()=>{
 for(const q of ['kind=bad','from=2026-02-30&to=2026-03-01','from=2026-01-01','from=2020-01-01&to=2026-01-01'])expect(()=>exportFilters(new URLSearchParams(q))).toThrow();
});
it('exports beyond the first page without rounding or writing records',async()=>{
 const row={id:'u',publicId:'USR-1',name:'QA',country:'PK',status:'ACTIVE',createdAt:new Date('2026-01-01'),role:'LISTENER',appRoles:[]};
 const findMany=vi.fn().mockResolvedValueOnce(Array.from({length:500},(_,i)=>({...row,id:`id${i}`}))).mockResolvedValueOnce([{...row,id:'last'}]);
 const db={user:{findMany},giftTransaction:{groupBy:async()=>[{senderId:'last',_sum:{coinValue:9007199254740993000n}}]},$queryRaw:async()=>[]};
 const {stream}=await directoryCsv(db,{kind:'users',from:'2026-01-01',to:'2026-01-31'});
 const csv=await new Response(stream).text();expect(csv.trim().split('\r\n')).toHaveLength(502);expect(csv).toContain('9007199254740993000');
 expect(findMany.mock.calls[1][0]).toMatchObject({cursor:{id:'id499'},skip:1,take:500});
});
