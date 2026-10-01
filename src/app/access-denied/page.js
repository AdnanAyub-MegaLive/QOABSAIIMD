import Link from "next/link";
import { auth, signOut } from "../../../auth";
import { redirect } from "next/navigation";
import { canAccessPage, pagePermissions } from "@/lib/portal-permissions";
export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/");
  const destination = Object.keys(pagePermissions).find(path => canAccessPage(session.user, path));
  return <main className="grid min-h-screen place-items-center bg-[#f4f8f7] p-6 text-[#142c2a]"><section className="max-w-lg rounded-2xl border border-[#dfe9e7] bg-white p-8"><h1 className="text-2xl font-bold">Access restricted</h1><p className="my-4 text-sm text-[#71847f]">Your account does not have access to this section. Ask your Manager to update your permissions.</p>{destination && <Link className="text-[#087f74]" href={destination}>Go to an available section →</Link>}<form className="mt-6" action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button className="rounded-lg border px-4 py-2 text-sm">Sign out</button></form></section></main>;
}
