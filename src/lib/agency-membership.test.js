import { expect,it } from "vitest";
import { assertMembershipResponder } from "./agency-membership.js";
const row={userId:"user",agency:{ownerUserId:"owner"}};
it("only the agency owner responds to a user request",()=>{
 expect(()=>assertMembershipResponder({...row,direction:"USER_REQUEST"},"owner")).not.toThrow();
 for(const id of ["user","stranger"])expect(()=>assertMembershipResponder({...row,direction:"USER_REQUEST"},id)).toThrow();
});
it("only the invited user responds to an owner invitation",()=>{
 expect(()=>assertMembershipResponder({...row,direction:"OWNER_INVITE"},"user")).not.toThrow();
 for(const id of ["owner","stranger"])expect(()=>assertMembershipResponder({...row,direction:"OWNER_INVITE"},id)).toThrow();
});
