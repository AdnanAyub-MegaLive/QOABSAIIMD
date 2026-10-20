import {beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({db:{},permission:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:m.db}));
vi.mock("@/lib/portal-admin",()=>({requirePermission:m.permission}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
import {publishProgression} from "../app/platform-rules/progression-actions.js";
import {validateProgressionThresholds} from "./progression-thresholds.js";
const config=()=>({enabled:false,rules:[],levels:[{track:"USER",level:0,thresholdPoints:"0",benefits:[]},{track:"USER",level:1,thresholdPoints:"900",benefits:[]},{track:"USER",level:2,thresholdPoints:"1800",benefits:[]},{track:"CHARM",level:0,thresholdPoints:"0",benefits:[]}]});
beforeEach(()=>{
  vi.clearAllMocks();m.permission.mockResolvedValue({id:"admin"});
  Object.assign(m.db,{uploadAsset:{count:vi.fn(async()=>0)},progressionConfiguration:{updateMany:vi.fn(),create:vi.fn(async()=>({version:4}))},userProgress:{findMany:vi.fn(async()=>[{userId:"u",track:"USER",lifetimePoints:1000n}]),update:vi.fn()},auditLog:{create:vi.fn()}});
  m.db.$transaction=vi.fn(fn=>fn(m.db));
});
it.each(["900","899","0"])("returns readable field validation for threshold %s without writes",async(value)=>{
  const input=config();input.levels[2].thresholdPoints=value;
  const result=await publishProgression(input);
  expect(result).toMatchObject({success:false,error:{code:"VALIDATION_ERROR",fields:{"USER:2":expect.stringContaining("at least 901")}}});
  expect(result.error.message).toContain("Wealth Level 2");expect(m.db.$transaction).not.toHaveBeenCalled();
});
it.each(["", "1.5", "1e3", "1,000", "-1", "9223372036854775808"])("rejects invalid integer %s in browser-safe and server validators",async(value)=>{
  const input=config();input.levels[1].thresholdPoints=value;
  expect(()=>validateProgressionThresholds(input.levels)).toThrow();
  expect(await publishProgression(input)).toMatchObject({success:false,error:{code:"VALIDATION_ERROR"}});
  expect(m.db.$transaction).not.toHaveBeenCalled();
});
it("accepts large exact thresholds, independent tracks and removed intermediate levels",async()=>{
  const input=config();input.levels[1].thresholdPoints="9007199254740993";input.levels[2].thresholdPoints="9007199254740994";
  expect(()=>validateProgressionThresholds(input.levels)).not.toThrow();
  input.levels=input.levels.filter(row=>row.track!=="USER"||row.level!==1);
  expect(await publishProgression(input)).toEqual({success:true,version:4});
  expect(m.db.userProgress.update).toHaveBeenCalledWith({where:{userId_track:{userId:"u",track:"USER"}},data:{configurationVersion:4,currentLevel:0,revision:{increment:1}}});
});
it("denies unauthorized users and missing badges without publishing",async()=>{
  m.permission.mockRejectedValueOnce(Object.assign(Error("Sign in first"),{code:"UNAUTHORIZED"}));
  expect(await publishProgression(config())).toMatchObject({success:false,error:{code:"UNAUTHORIZED"}});
  const input=config();input.levels[1].badgeAssetId="AST-missing";
  expect(await publishProgression(input)).toMatchObject({success:false,error:{code:"VALIDATION_ERROR"}});
  expect(m.db.$transaction).not.toHaveBeenCalled();
});
it("rejects duplicate levels and missing baselines with useful messages",()=>{
  const input=config();input.levels.push({...input.levels[1]});
  expect(()=>validateProgressionThresholds(input.levels)).toThrow("appears more than once");
  expect(()=>validateProgressionThresholds(config().levels.filter(l=>l.track!=="CHARM"))).toThrow("Charm needs a Level 0");
});
it("does not leak unexpected database messages",async()=>{
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  try{
    m.db.$transaction.mockRejectedValueOnce(Error("private database details"));
    const result=await publishProgression(config());
    expect(result.error.code).toBe("PROGRESSION_SAVE_FAILED");expect(JSON.stringify(result)).not.toContain("private database details");
  }finally{log.mockRestore();}
});
