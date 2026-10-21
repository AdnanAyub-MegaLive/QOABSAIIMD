import {it,expect,vi,beforeEach} from "vitest";
const m=vi.hoisted(()=>({event:vi.fn(),version:vi.fn(),file:vi.fn()}));
vi.mock("./prisma.js",()=>({prisma:{event:{findFirst:m.event},eventVersion:{findUnique:m.version}}}));
vi.mock("./events/storage.js",()=>({resolvePublishedFile:m.file}));
import {GET,HEAD} from "../app/event/[slug]/[[...path]]/route.js";
beforeEach(()=>{
  vi.clearAllMocks();m.event.mockResolvedValue({id:"e",version:2});
  m.version.mockResolvedValue({folderName:"version2",entryFile:"index.html"});
  m.file.mockImplementation(async(_,name)=>({extension:name.endsWith(".html")?".html":".js",buffer:Buffer.from("test"),details:{size:4}}));
});
const get=(path,headers={})=>GET(new Request(`https://portal.test/event/rankings/${path.join("/")}`,{headers}),{params:Promise.resolve({slug:"rankings",path})});
it("redirects entry HTML to published version and revalidates HTML",async()=>{
  const redirect=await get(["index.html"]);
  expect(redirect.status).toBe(307);
  expect(redirect.headers.get("location")).toBe("/event/rankings/_v/2/index.html");
  expect((await get(["_v","2","index.html"])).headers.get("cache-control")).toBe("no-cache");
});
it.each(["rankings","ranking-wealth","ranking-charm","ranking-cp","ranking-agency"])("keeps %s redirects on the public origin for internal proxy requests",async(slug)=>{
  for(const path of [["index.html"],["_v","1","index.html"],[]]){
    for(const handler of [GET,HEAD]){
      const response=await handler(new Request(`https://localhost:3000/event/${slug}/${path.join("/")}?view=app`,{headers:{"x-forwarded-host":"evil.example","x-forwarded-proto":"http"}}),{params:Promise.resolve({slug,path})});
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`/event/${slug}/_v/2/index.html?view=app`);
      expect(new URL(response.headers.get("location"),"https://portal.megachat.live").origin).toBe("https://portal.megachat.live");
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(await response.text()).toBe("");
    }
  }
});
it("caches versioned assets immutably with conditional 304; stable paths revalidate",async()=>{
  const response=await get(["_v","2","app.js"]);
  expect(response.headers.get("cache-control")).toContain("immutable");
  const cached=await get(["_v","2","app.js"],{"if-none-match":response.headers.get("etag")});
  expect(cached.status).toBe(304);expect(await cached.text()).toBe("");
  expect((await get(["app.js"])).headers.get("cache-control")).toBe("no-cache");
});
it("does not expose draft assets or unpublished events",async()=>{
  expect((await get(["_v","3","secret.js"])).status).toBe(404);
  expect(m.file).not.toHaveBeenCalled();
  m.event.mockResolvedValue(null);
  expect((await get(["_v","2","app.js"])).status).toBe(404);
});
