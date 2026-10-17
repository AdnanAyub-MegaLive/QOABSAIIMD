import { it,expect,vi } from 'vitest';
vi.mock('./decoration-media.js',()=>({decorationMedia:a=>({url:`https://media.test/${a.publicId}?v=${a.mediaVersion}`,mimeType:a.mimeType,mediaVersion:a.mediaVersion}),namedDecoration:(prefix,m)=>({[`${prefix}Url`]:m?.url??null,[`${prefix}MimeType`]:m?.mimeType??null,[`${prefix}MediaVersion`]:m?.mediaVersion??null})}));
import { levelTagBackgrounds,tagBackground } from './level-tag-backgrounds.js';
it('keeps four tracks and each level independent and selects no file bytes',async()=>{
 const findMany=vi.fn(async()=>['USER','CHARM','GAME','AGENCY'].map(track=>({track,level:2,asset:{publicId:track,mediaVersion:'abc',mimeType:'image/webp'}})));
 const map=await levelTagBackgrounds({levelTagBackground:{findMany}},'https://portal.test');
 for(const track of ['USER','CHARM','GAME','AGENCY'])expect(tagBackground(map,track,2).backgroundUrl).toContain(`/${track}?v=abc`);
 expect(tagBackground(map,'USER',3).backgroundUrl).toBeNull();
 expect(findMany.mock.calls[0][0].include.asset.select.fileData).toBeUndefined();
});
