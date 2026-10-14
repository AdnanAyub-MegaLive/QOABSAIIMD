import { expect, it } from "vitest";
import { hostReportAliases } from "./host-report-identity.js";
import { agencyWork } from "./agency-work.js";
it("merges exact identities before calculating host targets, never by ID suffix", () => {
  const aliases = hostReportAliases([{id:"u",publicId:"TLN-1"}], [{id:"t",publicId:"TLN-1"},{id:"other",publicId:"USR-1"}]);
  expect(aliases.has("other")).toBe(false);
  const result = agencyWork([
    {recipientDiamonds:60n,giftTransaction:{recipientUserId:"u"}},
    {recipientDiamonds:40n,giftTransaction:{talentId:"t"}},
  ], {version:1,diamondsPerUsd:100n,tiers:[{minDiamonds:"100",commissionBps:1000}]}, aliases);
  expect(result.hosts).toHaveLength(1);
  expect(result).toMatchObject({totalDiamonds:"100",salaryDiamonds:"10",qualifiedTalents:1});
});
it("does not fabricate USD valuation when monthly policy is missing", () => {
  expect(agencyWork([],null)).toMatchObject({totalUsd:null,salaryUsd:null,diamondsPerUsd:null,policyConfigured:false});
});
