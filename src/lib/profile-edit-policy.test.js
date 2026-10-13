import { describe, it, expect } from "vitest";
import { profileEditChanges, profileEditPermissions } from "./profile-edit-policy";
import { updateProfileWithHistory } from "./avatar-history";

const now = new Date("2026-10-13T12:00:00Z");
const initial = { id: "u1", country: "PK", dob: new Date("2000-01-01"), gender: "MALE", onboardingCompletedAt: null, countryChangeUsedAt: null, birthdayChangeUsedAt: null };
describe("onboarding-aware edit policy", () => {
  it("initial choices and onboarding corrections do not spend later allowances", () => {
    const change = profileEditChanges(initial, { country: "Germany", dob: "2001-01-01", completeOnboarding: true }, now);
    expect(change).toEqual({ country: "DE", dob: new Date("2001-01-01"), onboardingCompletedAt: now });
    expect(profileEditPermissions({ ...initial, ...change }).canChangeBirthday).toBe(true);
  });
  it("spends each post-onboarding allowance independently", () => {
    const user = { ...initial, onboardingCompletedAt: now };
    const country = profileEditChanges(user, { country: "DE" }, now);
    expect(country.countryChangeUsedAt).toBe(now);
    expect(country).not.toHaveProperty("birthdayChangeUsedAt");
    const birthday = profileEditChanges({ ...user, ...country }, { dob: "2002-02-02" }, now);
    expect(birthday.birthdayChangeUsedAt).toBe(now);
    expect(() => profileEditChanges({ ...user, ...country }, { country: "GB" }, now)).toThrow("one-time country");
    expect(() => profileEditChanges({ ...user, ...birthday }, { dob: "2003-01-01" }, now)).toThrow("one-time birthday");
  });
  it("same normalized values are harmless even after allowances are used", () => {
    const user = { ...initial, onboardingCompletedAt: now, countryChangeUsedAt: now, birthdayChangeUsedAt: now };
    expect(profileEditChanges(user, { country: "Pakistan", dob: "2000-01-01", gender: "male", completeOnboarding: true }, now)).toEqual({});
    expect(profileEditPermissions(user)).toMatchObject({ canChangeCountry: false, canChangeBirthday: false, canChangeGender: false });
  });
  it("rejects clearing, invalid values, future dates and resetting onboarding", () => {
    for (const body of [{ country: null }, { country: "invalid" }, { dob: null }, { dob: "2001-02-30" }, { dob: "2099-01-01" }, { gender: null }, { completeOnboarding: false }]) {
      expect(() => profileEditChanges(initial, body, now)).toThrow();
    }
    expect(() => profileEditChanges({ ...initial, dob: null }, { completeOnboarding: true }, now)).toThrow("Select country");
  });
  it("gender is immutable after its first successful choice including onboarding", () => {
    expect(profileEditChanges({ ...initial, gender: null }, { gender: "female" }, now)).toEqual({ gender: "FEMALE" });
    expect(() => profileEditChanges(initial, { gender: "FEMALE" }, now)).toThrow("Gender cannot");
  });
  it("does not allow a partially invalid multi-field request to spend another allowance", () => {
    const user = { ...initial, onboardingCompletedAt: now, birthdayChangeUsedAt: now };
    expect(() => profileEditChanges(user, { country: "DE", dob: "2002-01-01" }, now)).toThrow();
    expect(user.countryChangeUsedAt).toBeNull();
  });
  it("checks the fresh locked row for two concurrent different edits", async () => {
    let stored = { ...initial, onboardingCompletedAt: now }; let queue = Promise.resolve();
    const db = { $transaction: fn => {
      const run = queue.then(() => fn({ $queryRaw: async () => [], user: {
        findUnique: async () => ({ ...stored }), update: async ({ data }) => (stored = { ...stored, ...data }),
      } })); queue = run.catch(() => {}); return run;
    } };
    const edit = country => {
      const data = {};
      return updateProfileWithHistory(db, initial.id, data, async (_tx, locked) => Object.assign(data, profileEditChanges(locked, { country }, now)));
    };
    const results = await Promise.allSettled([edit("DE"), edit("GB")]);
    expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(stored.country).toBe("DE");
  });
});
