import { describe, it, expect } from "vitest";
import { progressionEditorData } from "./progression-editor.js";
import { validateProgressionConfig } from "./progression.js";
import { giftXpEarningRules, giftProgressionRule } from "./progression-earning-policy.js";

describe("Account Levels editor", () => {
  it.each(['PAID','BACKPACK','LUCKY','BLIND_BOX'])("includes normal receiving and self-gift Charm XP (%s)", source => {
    const rules=giftXpEarningRules();
    const input={track:'CHARM',source,recipientType:'NORMAL_USER',senderId:'a',recipientId:'a'};
    expect(giftProgressionRule(rules,input)).toMatchObject({basis:'GIFT_XP',numerator:'1',denominator:'1',allowSelf:true});
    expect(giftProgressionRule(rules,{...input,recipientId:'b'})).toMatchObject({basis:'GIFT_XP'});
    expect(giftProgressionRule(rules,{...input,recipientId:'b',recipientType:'HOST'})).toMatchObject({basis:'GIFT_XP'});
    expect(giftProgressionRule([] ,input)).toBeUndefined();
    expect(giftProgressionRule(rules,{...input,track:'USER'})).toMatchObject({track:'USER',recipientType:'ANY'});
  });
  it("restores defaults for a fresh or empty configuration", () => {
    const draft={...progressionEditorData(null),enabled:true};
    expect(validateProgressionConfig(draft).rules).toHaveLength(12);
    const approved=validateProgressionConfig({...draft,rules:giftXpEarningRules()});
    expect(approved.rules).toHaveLength(12);
    for(const source of ['PAID','BACKPACK','LUCKY','BLIND_BOX']) {
      expect(approved.rules.filter(r=>r.source===source).map(r=>[r.track,r.recipientType])).toEqual([['USER','ANY'],['CHARM','NORMAL_USER'],['CHARM','HOST']]);
    }
    expect(approved.rules.every(r=>r.basis==='GIFT_XP'&&r.allowSelf&&r.numerator==='1'&&r.denominator==='1')).toBe(true);
    expect(draft.rules).toEqual([]);
  });
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
