import { headers } from "next/headers";
import { approvedSuperAdminDevice, deviceRestrictionApplies } from "./super-admin-device.js";

export async function canAccessFromDevice(role, request) {
  if (!deviceRestrictionApplies(role)) return true;
  return approvedSuperAdminDevice(request?.headers || await headers());
}
