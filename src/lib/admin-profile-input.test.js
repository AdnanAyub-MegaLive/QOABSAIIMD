import { expect, it } from "vitest";
import { adminProfileFields } from "./admin-profile-input.js";
import { countryOptions } from "./geo-country.js";
it("allows Google accounts without phone and optional email", () => {
  expect(adminProfileFields({ name: " Alex ", phone: "", email: "", country: "Pakistan" })).toEqual({ name: "Alex", phone: null, email: null, country: "PK" });
});
it("normalizes phone, email and country codes", () => {
  expect(adminProfileFields({ phone: "+92 300-1234567", email: " A@Example.com ", country: "pk" })).toEqual({ phone: "+923001234567", email: "a@example.com", country: "PK" });
});
it("does not overwrite omitted fields or accept privileged fields", () => {
  expect(adminProfileFields({ role: "MANAGER", coinBalance: 500 })).toEqual({});
});
it.each([{ name: " " }, { phone: "invalid" }, { email: "bad" }, { country: "ZZ" }])("rejects invalid data %j", input => {
  expect(() => adminProfileFields(input)).toThrow();
});
it("provides unique validated country options", () => {
  expect(countryOptions).toHaveLength(249);
  expect(new Set(countryOptions.map(item => item.code)).size).toBe(249);
  expect(countryOptions).toContainEqual({ code: "PK", name: "Pakistan" });
});
