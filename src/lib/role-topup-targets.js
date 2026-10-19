export const TARGET_ROLES = ["BD","ADMIN","JUNIOR_ADMIN","SENIOR_ADMIN","SUPER_ADMIN","COUNTRY_HEAD","MANAGER"];
export function validateTopUpTargets(rows) {
  if (!Array.isArray(rows) || rows.length > TARGET_ROLES.length) throw new Error("Invalid top-up targets.");
  const seen = new Set();
  return rows.map(row => {
    if (!TARGET_ROLES.includes(row.role) || seen.has(row.role) ||
      !/^\d{1,18}$/.test(String(row.targetDiamonds)) || !/^\d{1,18}(\.\d{1,2})?$/.test(String(row.salaryAmount)) ||
      !["","COINS","DIAMONDS","USD"].includes(row.salaryCurrency) || ![undefined,"","OWN"].includes(row.scope)) throw new Error("Enter valid Diamond targets and salary amounts. Only directly assigned agencies count.");
    if (["COINS","DIAMONDS"].includes(row.salaryCurrency) && String(row.salaryAmount).includes(".")) throw new Error("Coin and Diamond salaries must be whole amounts.");
    seen.add(row.role);
    return {role:row.role,targetDiamonds:BigInt(row.targetDiamonds).toString(),salaryAmount:String(row.salaryAmount),salaryCurrency:row.salaryCurrency,scope:"OWN"};
  });
}
