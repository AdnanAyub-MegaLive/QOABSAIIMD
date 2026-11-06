import {it,expect} from 'vitest';
import {gameAccess,gameAccessLevels} from './access.mjs';
import {playerCatalog} from './catalog.mjs';
const game={id:'test-game',engine:'external',launchUrl:'https://third-party.test/play',status:'active',minViewLevel:3,minPlayLevel:7};
it('enforces view and play thresholds inclusively',()=>{
 expect([2,3,6,7].map(level=>gameAccess(game,{},level))).toEqual(['hidden','preview','preview','play']);
 expect(gameAccess({}, {},0)).toBe('play');
 expect(()=>gameAccessLevels({minViewLevel:3,minPlayLevel:2})).toThrow();
});
it('resellers never receive an external play URL even above the play level',()=>{
 const user={appRoles:['HOST','RESELLER']};
 expect(playerCatalog([game],'https://portal.test',user,2)).toEqual([]);
 expect(playerCatalog([game],'https://portal.test',user,99)[0]).toMatchObject({previewOnly:true,requiresPortalSession:true,launchUrl:'https://portal.test/games/play?game=test-game'});
 expect(playerCatalog([game],'https://portal.test',{},7)[0].launchUrl).toBe(game.launchUrl);
});

import {enterSharedRound,answerSharedRound,cashOutRocket,sharedSnapshot} from './shared-games.js';
const identity={userId:'u',roomId:'room',expiresAt:new Date('2099-01-01'),claims:{userId:'public',exp:4102444800,sessionVersion:1}};
function gameDb(roles,level) {
 const user={id:'u',publicId:'public',status:'ACTIVE',sessionVersion:1,appRoles:roles};
 const db={
   $queryRaw:async()=>[],user:{findUnique:async()=>user},
   audioRoom:{findUnique:async()=>({id:'room',status:'LIVE'})},audioRoomMember:{findUnique:async()=>({socketCount:1})},audioRoomBan:{findFirst:async()=>null},
   gameDefinition:{findUnique:async()=>({settings:{minViewLevel:3,minPlayLevel:7}})},
   userProgress:{findUnique:async()=>({currentLevel:level})},
   sharedGameEntry:{findUnique:async()=>({userId:'u',roomId:'room',day:{gameId:'rocket',settings:{engine:'rocket'}}})}
 };
 db.$transaction=fn=>fn(db);
 return db;
}
it.each([['reseller',['RESELLER'],99],['below play level',[],6]])('rejects live actions for %s before modifying an entry or wallet',async(_,roles,level)=>{
 const db=gameDb(roles,level);
 const input={gameId:'rocket',id:'12345678-1234-4321-8765-123456789abc',dayId:'day',slot:1};
 for(const send of [enterSharedRound,answerSharedRound,cashOutRocket]) {
   await expect(send(identity,input,db)).rejects.toMatchObject({status:403});
 }
});
it('denies direct round viewing below the view level',async()=>{
 await expect(sharedSnapshot(identity,{gameId:'rocket'},gameDb([],2))).rejects.toMatchObject({status:403});
});
