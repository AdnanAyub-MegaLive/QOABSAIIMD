import { expect, it, vi } from "vitest";
import { containsProhibitedWord, validateProhibitedWords, assertChatWordsAllowed } from "./chat-word-policy.js";

it("matches words regardless of case, punctuation, width or invisible formatting", () => {
  for (const text of ["A BADWORD!", "bad\u200bword", "ＢＡＤＷＯＲＤ"]) expect(containsProhibitedWord(text, ["badword"])).toBe(true);
});
it("avoids accidental substring matches", () => {
  expect(containsProhibitedWord("class assignment", ["ass"])).toBe(false);
  expect(containsProhibitedWord("badwordish", ["badword"])).toBe(false);
});
it("supports Unicode words, phrases, and literal regex characters", () => {
  expect(containsProhibitedWord("یہ خراب ہے", ["خراب"])).toBe(true);
  expect(containsProhibitedWord("a bad\n phrase!", ["bad phrase"])).toBe(true);
  expect(containsProhibitedWord("a+b", ["a+b"])).toBe(true);
  expect(containsProhibitedWord("anything", [".*"])).toBe(false);
});
it("validates bounds and deduplicates normalized entries", () => {
  expect(validateProhibitedWords([" BadWord ", "badword"])).toEqual(["badword"]);
  expect(validateProhibitedWords([])).toEqual([]);
  for (const words of [null, [null], [" "], ["\u200b"], ["x".repeat(101)], Array(501).fill("x")]) expect(() => validateProhibitedWords(words)).toThrow();
});
it("returns a clear rejection and reads fresh policy for subsequent sends", async () => {
  const findUnique = vi.fn().mockResolvedValueOnce({ words: ["badword"] }).mockResolvedValueOnce({ words: [] });
  const db = { chatWordPolicy: { findUnique } };
  await expect(assertChatWordsAllowed(db, "badword")).rejects.toMatchObject({ code: "INAPPROPRIATE_WORD", status: 422 });
  await expect(assertChatWordsAllowed(db, "badword")).resolves.toBeUndefined();
});
it("allows an empty initial policy but fails closed on database errors", async () => {
  await expect(assertChatWordsAllowed({ chatWordPolicy: { findUnique: async () => null } }, "hello")).resolves.toBeUndefined();
  await expect(assertChatWordsAllowed({ chatWordPolicy: { findUnique: async () => { throw new Error("database unavailable"); } } }, "hello")).rejects.toThrow("database unavailable");
});
