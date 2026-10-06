import { cookies } from "next/headers";
import { browserManagementUser,MANAGEMENT_COOKIE } from "@/lib/management-web";
import { managementRole,displayApplicationRole } from "@/lib/user-roles";
import ManagementCenter from "./management-center";
export const dynamic="force-dynamic";
export default async function Page(){let user;try{user=await browserManagementUser((await cookies()).get(MANAGEMENT_COOKIE)?.value);}catch{return <main className="grid min-h-screen place-items-center bg-[#f4f8f7] p-8"><div className="rounded-2xl bg-white p-8"><h1 className="text-xl font-bold">Open Management Portal from Mega Live</h1><p className="mt-3">Your portal session is unavailable or expired. Return to the app and tap Management Portal.</p></div></main>;}return <ManagementCenter me={{publicId:user.publicId,name:user.name,country:user.country,role:managementRole(user),roleLabel:displayApplicationRole(managementRole(user))}}/>;}
