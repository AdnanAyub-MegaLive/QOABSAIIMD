import { describe, it, expect } from "vitest";
import { progressionEditorData } from "./progression-editor.js";
import { validateProgressionConfig } from "./progression.js";

describe("Account Levels editor", () => {
  it("opens an explicit disabled draft after configuration is absent", () => {
    const draft=progressionEditorData(null);
    expect(draft.configured).toBe(false);
    expect(draft.enabled).toBe(false);
    expect(draft.levels.map(row=>row.track)).toEqual(["USER","CHARM"]);
    expect(()=>validateProgressionConfig(draft)).not.toThrow();
  });
  it("preserves saved configuration and exact large thresholds without mutation", () => {
    const saved={version:9,enabled:true,rules:[],levels:[{track:"USER",level:7,thresholdPoints:9007199254740993n,badgeAssetId:null,benefits:[]}]};
    const result=progressionEditorData(saved);
    expect(result).toMatchObject({configured:true,version:9,enabled:true});
    expect(result.levels[0].thresholdPoints).toBe("9007199254740993");
    expect(saved.levels[0].thresholdPoints).toBe(9007199254740993n);
  });
});
