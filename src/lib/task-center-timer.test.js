import { expect,it,vi } from "vitest";
vi.mock("./daily-tasks.js",()=>({addDailyTaskProgress:vi.fn()}));
import { addDailyTaskProgress } from "./daily-tasks.js";
import { createTaskTimer } from "./task-center-timer.js";
it("credits one sample per user even with multiple sockets/seats, with no duplicate tick credit",async()=>{
 vi.mocked(addDailyTaskProgress).mockClear();let cursor=null;const now=new Date("2026-10-21T12:00:30Z");
 const seat={occupantUserId:"u",audioRoom:{roomId:"ROOM"}};
 const db={dailyTaskDefinition:{count:async()=>1},audioRoomSeat:{findMany:async()=>[seat,seat]},user:{findUnique:async()=>({status:"ACTIVE"})},taskTimerCursor:{findUnique:async()=>cursor,upsert:async({create})=>{cursor=create;}},$transaction:fn=>fn(db)};
 const socket={data:{internalUserId:"u",audioRoomTaskTimers:new Map([["ROOM",{startedAt:now.getTime()-60000}]])},rooms:new Set(["audio-room:ROOM"])};
 const sample=createTaskTimer(db,{sockets:{sockets:new Map([["one",socket],["two",socket]])}});
 await sample(now);await sample(now);expect(addDailyTaskProgress).toHaveBeenCalledTimes(1);expect(addDailyTaskProgress.mock.calls[0].slice(0,4)).toEqual(["u","ON_MIC",15,new Date("2026-10-21T12:00:15Z")]);
});
it("does not credit disconnected or newly joined users",async()=>{
 vi.mocked(addDailyTaskProgress).mockClear();const now=new Date("2026-10-21T12:00:30Z");const transaction=vi.fn();
 const db={dailyTaskDefinition:{count:async()=>1},audioRoomSeat:{findMany:async()=>[{occupantUserId:"u",audioRoom:{roomId:"ROOM"}}]},$transaction:transaction};
 const socket={data:{internalUserId:"u",audioRoomTaskTimers:new Map([["ROOM",{startedAt:now.getTime()}]])},rooms:new Set(["audio-room:ROOM"])};
 await createTaskTimer(db,{sockets:{sockets:new Map([["one",socket]])}})(now);expect(transaction).not.toHaveBeenCalled();
 await createTaskTimer(db,{sockets:{sockets:new Map()}})(now);expect(addDailyTaskProgress).not.toHaveBeenCalled();
});
