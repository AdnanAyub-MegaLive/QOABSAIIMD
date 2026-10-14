import {it,expect} from "vitest";
import {validateCardRanges,matchCardRange} from "./profile-card-artwork.js";
it("selects exact boundaries and open-ended levels",()=>{
 const rows=validateCardRanges([{track:"SUPPORTER",min:0,max:9,backgroundAssetId:"AST-A"},{track:"SUPPORTER",min:10,max:null,backgroundAssetId:"AST-B"}]);
 expect(matchCardRange(rows,"SUPPORTER",9).backgroundAssetId).toBe("AST-A");
 expect(matchCardRange(rows,"SUPPORTER",10).backgroundAssetId).toBe("AST-B");
 expect(matchCardRange(rows,"SUPPORTER",100).backgroundAssetId).toBe("AST-B");
 expect(matchCardRange(rows,"AGENCY",10)).toBeNull();
 expect(matchCardRange(rows,"SUPPORTER",null)).toBeNull();
});
it("rejects overlapping, reversed, and invalid asset ranges",()=>{
 for(const rows of [[{track:"SUPPORTER",min:0,max:9},{track:"SUPPORTER",min:9,max:12}],[{track:"AGENCY",min:3,max:1}],[{track:"SUPPORTER",min:0,max:null,backgroundAssetId:"https://evil.test"}]])expect(()=>validateCardRanges(rows)).toThrow();
});
