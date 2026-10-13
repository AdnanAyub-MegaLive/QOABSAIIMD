import { expect, it } from "vitest";
import { UPLOAD_SECTIONS, filterUploadRecords } from "../app/uploads/upload-sections";
it("keeps gifts separate and preserves supporting media while consolidating duplicate categories",()=>{
  const categories=Object.values(UPLOAD_SECTIONS).flat();
  expect(categories).toHaveLength(18);
  expect(new Set(categories).size).toBe(18);
  expect(UPLOAD_SECTIONS["Other Assets"]).toContain("APK");
  expect(UPLOAD_SECTIONS.Gifts).toEqual(["Gifts"]);
  expect(UPLOAD_SECTIONS.Props).toHaveLength(11);
  expect(categories).not.toContain("Medals");
  expect(categories).not.toContain("Role Artwork");
  expect(categories).not.toContain("Tail-lights");
  expect(UPLOAD_SECTIONS.Props).not.toContain("Gifts");
  expect(UPLOAD_SECTIONS["Other Assets"]).toContain("Banners");
});
it("filters names, public IDs, status and gift type independently",()=>{
  const rows=[{id:"AST-1",name:"Rose",active:true,giftTier:"NORMAL"},{id:"AST-2",name:"Royal",active:false,giftTier:"VIP"}];
  expect(filterUploadRecords(rows,{query:"ast-2"})).toEqual([rows[1]]);
  expect(filterUploadRecords(rows,{query:"RO",status:"ACTIVE"})).toEqual([rows[0]]);
  expect(filterUploadRecords(rows,{giftTier:"VIP",status:"ACTIVE"})).toEqual([]);
});
