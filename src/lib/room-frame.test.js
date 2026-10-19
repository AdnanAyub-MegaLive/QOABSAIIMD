import {expect,it,vi} from 'vitest';
vi.mock('./decoration-media.js',()=>({decorationMedia:a=>({assetId:a.publicId,url:'https://media.test/frame.svga',mimeType:a.mimeType,mediaVersion:a.mediaVersion,posterUrl:null})}));
import {changeRoomFrame,serializeRoomFrame} from './room-frame.js';
import {validateUploadAssetContract,validUploadCategories} from './upload-assets.js';
import {canPublishMedia} from './media-cdn-policy.js';
const asset={id:'asset',publicId:'AST-1',category:'ROOM_FRAMES',active:true,mimeType:'application/svga',mediaVersion:'1234',assignments:[{userId:'owner',expiresAt:null}]};
it('accepts SVGA room frames and preserves restricted CDN policy',()=>{
 expect(validUploadCategories.has('ROOM_FRAMES')).toBe(true);
 expect(()=>validateUploadAssetContract({category:'ROOM_FRAMES',mimeType:'application/svga'})).not.toThrow();
 expect(()=>validateUploadAssetContract({category:'ROOM_FRAMES',mimeType:'audio/mp4'})).toThrow();
 expect(canPublishMedia({...asset,storeVisible:true})).toBe(true);
 expect(canPublishMedia({...asset,storeVisible:false,isGlobal:false})).toBe(false);
});
it('returns artwork only for current owner entitlement',()=>{
 const room={ownerId:'owner',roomFrameAsset:asset,roomFrameVersion:3};
 expect(serializeRoomFrame(room,'https://portal.test')).toMatchObject({assetId:'AST-1',mimeType:'application/svga',version:3});
 expect(serializeRoomFrame({...room,ownerId:'stranger'})).toBeNull();
 expect(serializeRoomFrame({...room,roomFrameAsset:{...asset,active:false}})).toBeNull();
 expect(serializeRoomFrame({...room,roomFrameAsset:{...asset,assignments:[{userId:'owner',expiresAt:new Date(0)}]}})).toBeNull();
});
function dbFor(ownerId='owner',owned=true){
 const db={audioRoom:{findUnique:vi.fn(async()=>({id:'room',ownerId,roomId:'ROOM-1'})),update:vi.fn(async({data})=>({ownerId,roomFrameVersion:1,roomFrameAsset:data.roomFrameAssetId?asset:null}))},uploadAsset:{findFirst:vi.fn(async()=>owned?{id:'asset'}:null)},auditLog:{create:vi.fn()}};
 db.$transaction=fn=>fn(db);return db;
}
it('rejects non-owners and missing ownership without mutations',async()=>{
 const db=dbFor('another');
 await expect(changeRoomFrame(db,{id:'owner'},'ROOM-1','AST-1','https://portal.test')).rejects.toMatchObject({code:'ROOM_OWNER_REQUIRED'});
 expect(db.audioRoom.update).not.toHaveBeenCalled();
 const expired=dbFor('owner',false);
 await expect(changeRoomFrame(expired,{id:'owner'},'ROOM-1','AST-1','https://portal.test')).rejects.toMatchObject({code:'PROP_NOT_OWNED'});
 expect(expired.audioRoom.update).not.toHaveBeenCalled();
});
it('equips and clears without wallet operations',async()=>{
 const db=dbFor();
 expect((await changeRoomFrame(db,{id:'owner',publicId:'USR-1'},'ROOM-1','AST-1','https://portal.test')).roomFrame.assetId).toBe('AST-1');
 expect((await changeRoomFrame(db,{id:'owner',publicId:'USR-1'},'ROOM-1',null,'https://portal.test')).roomFrame).toBeNull();
 expect(db.auditLog.create).toHaveBeenCalledTimes(2);
});
