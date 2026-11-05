import { describe, it, expect, vi } from 'vitest';
vi.mock('./profile-display-assets.js',()=>({equippedProfileAssets:vi.fn(async()=>new Map([['a',{avatarFrame:{url:'https://cdn.example/frame.png'}}]]))}));
vi.mock('./avatar-history.js',()=>({avatarDisplayUrl:value=>value}));
import { userCp, cpSeatPresence } from './cp-profile.js';
const a={id:'a',publicId:'A',name:'Alice',profileImage:'/a.png'}, b={id:'b',publicId:'B',name:'Bob',profileImage:'/b.png'};
const row={id:'rel',publicId:'REL-1',leftUserId:'a',rightUserId:'b',left:a,right:b,exp:150n,startedAt:new Date(Date.now()-3*86400000)};
function fixture(){return {profileRelationship:{findFirst:vi.fn(async()=>row),findMany:vi.fn(async()=>[row])},userBlock:{findFirst:vi.fn(async()=>null)},cpLevel:{findMany:vi.fn(async()=>[{level:1,name:'Together',minExp:100n,enabled:true,seatEffect:'WAVE_1',seatColor:'#FF66AA'},{level:2,minExp:200n,enabled:true}])},cpLevelClaim:{findMany:vi.fn(async()=>[{level:1}])}};}
describe('CP public and seat responses',()=>{
 it('returns the partner, equipped frame, exact progress and reward claims',async()=>{const db=fixture();expect(await userCp(db,a,a,'https://portal.example')).toMatchObject({id:'REL-1',self:{publicId:'A',frameUrl:'https://cdn.example/frame.png'},partner:{publicId:'B'},level:1,levelName:'Together',exp:'150',currentLevelExp:'100',nextLevelExp:'200',daysTogether:3,claimedRewards:[1]});});
 it('does not reveal blocked or absent relationships',async()=>{const db=fixture();db.userBlock.findFirst.mockResolvedValue({id:'block'});expect(await userCp(db,a,b,'')).toBeNull();db.profileRelationship.findFirst.mockResolvedValue(null);expect(await userCp(db,a,b,'')).toBeNull();});
 it('gives both seats the opposite public ID and current configured effect',async()=>{const db=fixture();const seats=await cpSeatPresence(db,[a,b]);expect(seats.get('a')).toEqual({partnerId:'B',level:1,seatEffect:'WAVE_1',seatColor:'#FF66AA'});expect(seats.get('b').partnerId).toBe('A');db.cpLevel.findMany.mockResolvedValue([]);expect((await cpSeatPresence(db,[a])).get('a')).toMatchObject({level:0,seatEffect:null});});
});
