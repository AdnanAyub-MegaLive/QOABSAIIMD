import { it,expect,vi } from 'vitest';
vi.mock('./decoration-media.js',()=>({decorationMedia:a=>{if(a.publicId==='BAD')throw new TypeError('Invalid URL');return {url:`https://media.test/${a.publicId}?v=${a.mediaVersion}`,mimeType:a.mimeType,mediaVersion:a.mediaVersion};},namedDecoration:(prefix,m)=>({[`${prefix}Url`]:m?.url??null,[`${prefix}MimeType`]:m?.mimeType??null,[`${prefix}MediaVersion`]:m?.mediaVersion??null})}));
import { levelTagBackgrounds,tagBackground } from './level-tag-backgrounds.js';
it('keeps four tracks and each level independent and selects no file bytes',async()=>{
 const findMany=vi.fn(async()=>['USER','CHARM','GAME','AGENCY'].map(track=>({track,level:2,asset:{publicId:track,mediaVersion:'abc',mimeType:'image/webp'}})));
 const map=await levelTagBackgrounds({levelTagBackground:{findMany}},'https://portal.test');
 for(const track of ['USER','CHARM','GAME','AGENCY'])expect(tagBackground(map,track,2).backgroundUrl).toContain(`/${track}?v=abc`);
 expect(tagBackground(map,'USER',3).backgroundUrl).toBeNull();
 expect(findMany.mock.calls[0][0].include.asset.select.fileData).toBeUndefined();
});
it('skips only malformed artwork and returns none for absent origin',async()=>{
 const findMany=vi.fn(async()=>[{track:'AGENCY',level:0,asset:{publicId:'BAD'}},{track:'AGENCY',level:1,asset:{publicId:'GOOD'}}]);
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 try{const map=await levelTagBackgrounds({levelTagBackground:{findMany}},'https://portal.test');expect(map.has('AGENCY:0')).toBe(false);expect(map.has('AGENCY:1')).toBe(true);
 findMany.mockClear();expect(await levelTagBackgrounds({levelTagBackground:{findMany}},null)).toEqual(new Map());expect(findMany).not.toHaveBeenCalled();}finally{warn.mockRestore();}
});
