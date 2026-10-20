import {it,expect,vi} from "vitest";
import cache from "./web-cache.cjs";
function response(headers){
  const map=new Map(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
  return {getHeader:k=>map.get(k.toLowerCase()),setHeader:(k,v)=>map.set(k.toLowerCase(),v),writeHead:vi.fn()};
}
it("revalidates HTML/data while preserving no-store and Next immutable bundles",()=>{
  for(const [path,type,initial,expected] of [
    ["/games/play","text/html","public, max-age=3600","private, no-cache, must-revalidate"],
    ["/api/events/rankings","application/json","","private, no-cache, must-revalidate"],
    ["/management/api/session","application/json","private, no-store","private, no-store"],
    ["/_next/static/chunk.js","text/javascript","public, max-age=31536000, immutable","public, max-age=31536000, immutable"],
    ["/api/private/file","image/png","private, no-store","private, no-store"],
  ]){
    const res=response({"Content-Type":type,"Cache-Control":initial});
    cache.applyWebCacheHeaders({method:"GET",url:path},res);res.writeHead(200);
    expect(res.getHeader("Cache-Control")).toBe(expected);
  }
});
