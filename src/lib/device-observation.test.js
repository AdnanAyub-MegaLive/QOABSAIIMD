import { expect, it } from "vitest";
import { observedDeviceIp, observedDeviceLocation } from "./device-observation.js";
it("ignores loopback and unavailable IP observations",()=>{
  for(const ip of ["127.0.0.1","127.1.2.3","::ffff:127.0.0.1","::1","::","0.0.0.0","invalid",null])expect(observedDeviceIp(ip)).toBeNull();
  expect(observedDeviceIp("::ffff:1.1.1.1")).toBe("1.1.1.1");
});
it("preserves valid locations when a lookup fails",()=>{
  for(const value of ["Unknown"," unknown location ","unknown, unknown","N/A","",null])expect(observedDeviceLocation(value)).toBeNull();
  expect(observedDeviceLocation(" Islamabad, Pakistan ")).toBe("Islamabad, Pakistan");
});
