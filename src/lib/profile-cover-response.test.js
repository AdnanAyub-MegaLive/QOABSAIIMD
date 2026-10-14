import {it,expect} from "vitest";
import {coverResponse} from "./profile-cover-response.js";
it("serves bounded and suffix ranges with MIME metadata",async()=>{
 const row={imageData:Buffer.from("0123456789"),mimeType:"video/mp4"};
 const r=coverResponse(row,"bytes=2-5");expect(r.status).toBe(206);expect(await r.text()).toBe("2345");expect(r.headers.get("content-type")).toBe("video/mp4");
 expect(await coverResponse(row,"bytes=-2").text()).toBe("89");
 expect(coverResponse(row,"bytes=10-").status).toBe(416);
 expect(coverResponse(row,"bytes=0-1,4-5").status).toBe(416);
});
