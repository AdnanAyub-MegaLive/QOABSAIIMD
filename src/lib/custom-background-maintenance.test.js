import {it,expect,vi} from "vitest";
import {expirePendingCustomBackgrounds} from "./custom-background-maintenance.js";
it("refunds an overdue pending request once and leaves its audit record",async()=>{
 const item={id:"r",publicId:"CBG-1",userId:"u",coins:100n,status:"PENDING",submittedAt:new Date(0),user:{status:"ACTIVE",deletedAt:null}};
 const db={$queryRaw:vi.fn(),customRoomBackgroundRequest:{findMany:async()=>[{publicId:item.publicId}],findUnique:async()=>item,update:async({data})=>Object.assign(item,data)},user:{update:vi.fn()},ban:{findFirst:async()=>null},walletTransaction:{create:vi.fn()},auditLog:{create:vi.fn()},notification:{upsert:vi.fn()}};
 db.$transaction=fn=>fn(db);
 await expirePendingCustomBackgrounds(db,new Date(4*86400000));
 await expirePendingCustomBackgrounds(db,new Date(4*86400000));
 expect(db.walletTransaction.create).toHaveBeenCalledTimes(1);
 expect(db.user.update).toHaveBeenCalledWith({where:{id:"u"},data:{coinBalance:{increment:100n}}});
 expect(item.status).toBe("REJECTED");expect(item.rejectionReason).toBe("Not reviewed in time");
 expect(db.auditLog.create).toHaveBeenCalledTimes(1);
});
