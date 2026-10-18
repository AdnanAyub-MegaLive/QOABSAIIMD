import {expect,it,vi} from 'vitest';
import sharp from 'sharp';
vi.mock('../upload-assets.js',()=>({createPublicDisplayAssetUrl:(origin,a)=>`${origin}/api/uploads/${a.publicId}/file?v=${a.mediaVersion}&displaySig=test`}));
import {attachGameIcons,decodeGameIcon,gameIconWhere} from './catalog-icons.js';
import {iconAssetSetting} from './icon-artwork.js';
import {validateGame} from './rules.mjs';
it('persists icon selection for a linked game and supports clearing',()=>{
 const game={id:'test-game',engine:'external',name:'Test game',status:'paused',launchUrl:'https://example.com',iconAssetId:'AST-custom'};
 expect(validateGame(game).iconAssetId).toBe('AST-custom');
 expect(validateGame({...game,iconAssetId:null}).iconAssetId).toBeNull();
 expect(()=>iconAssetSetting('https://private.example/file')).toThrow();
});
it('resolves only global active game artwork and preserves defaults otherwise',async()=>{
 const asset={publicId:'AST-custom',mimeType:'image/webp',mediaVersion:'abc'};
 const db={uploadAsset:{findMany:vi.fn(async()=>[asset])}};
 const result=await attachGameIcons(db,[{iconAssetId:'AST-custom',iconUrl:'default'},{iconAssetId:'AST-missing',iconUrl:'default'}],'https://portal.example');
 expect(db.uploadAsset.findMany.mock.calls[0][0].where).toMatchObject(gameIconWhere);
 expect(result[0].iconUrl).toContain('AST-custom/file?v=abc');
 expect(result[0].imageUrl).toBe(result[0].iconUrl);
 expect(result[1].iconUrl).toBe('default');
});
it('decodes and optimizes real images but rejects spoofed content and oversized files',async()=>{
 const bytes=await sharp({create:{width:800,height:400,channels:3,background:'red'}}).png().toBuffer();
 const file={type:'image/png',size:bytes.length,arrayBuffer:async()=>bytes};
 const output=await decodeGameIcon(file);
 expect(await sharp(output).metadata()).toMatchObject({format:'webp',width:256,height:256});
 await expect(decodeGameIcon({...file,type:'image/jpeg'})).rejects.toMatchObject({status:422});
 await expect(decodeGameIcon({...file,size:6*1024*1024})).rejects.toMatchObject({status:422});
});
