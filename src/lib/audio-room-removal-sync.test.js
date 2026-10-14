import { expect, it, vi } from "vitest";
import { syncAudioRoomRemoval } from "./audio-room-removal-sync.js";
it.each([0, 2])("broadcasts canonical cleared seats and %i remaining unique members without announcing a kick", async total => {
  const events=[];
  const room={id:"internal",roomId:"ROOM-1",revision:12,seatLayout:[3,4,4]};
  const tx={audioRoom:{update:vi.fn().mockResolvedValueOnce(room).mockResolvedValueOnce({...room,participantCount:total})},audioRoomMember:{count:vi.fn(async()=>total)}};
  const db={$transaction:async fn=>fn(tx)};
  const io={to:vi.fn(channel=>({emit:(event,payload)=>events.push({channel,event,payload})}))};
  const seats=vi.fn(async()=>events.push({event:"audio-room:seat-update"}));
  expect(await syncAudioRoomRemoval(db,io,seats,"ROOM-1","USR-2","https://portal.example")).toBe(12);
  expect(tx.audioRoomMember.count).toHaveBeenCalledWith({where:{audioRoomId:"internal",socketCount:{gt:0}}});
  expect(seats).toHaveBeenCalledWith({...room,participantCount:total},"https://portal.example",total,true);
  expect(events.map(e=>e.event)).toEqual(["audio-room:seat-update","audio-room:member-left"]);
  expect(events[1]).toEqual({channel:"audio-room:ROOM-1",event:"audio-room:member-left",payload:{success:true,data:{roomId:"ROOM-1",revision:12,total,userId:"USR-2"}}});
});
it("does not report success when seat synchronization fails", async()=>{
  const room={id:"i",roomId:"ROOM-1",revision:1,participantCount:1};
  const db={$transaction:async fn=>fn({audioRoom:{update:async()=>room},audioRoomMember:{count:async()=>1}})};
  const io={to:vi.fn()};
  await expect(syncAudioRoomRemoval(db,io,async()=>{throw Error("snapshot failed")},"ROOM-1","USR-2","")).rejects.toThrow("snapshot failed");
  expect(io.to).not.toHaveBeenCalled();
});
