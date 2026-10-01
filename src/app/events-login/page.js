import { redirect } from "next/navigation";
import { eventCookies, verifyEventAccessToken } from "../../lib/events/auth.js";
import { cookies } from "next/headers";
import EventsLoginForm from "./events-login-form.js";

export const metadata = { title: "Events Login | Mega Live Portal" };

export default async function EventsLoginPage() {
  const token = (await cookies()).get(eventCookies.access)?.value;
  if (token) {
    try {
      verifyEventAccessToken(token);
      redirect("/events-management");
    } catch {}
  }
  return (
    <main className="min-h-screen bg-[#eef5f3] px-5 py-12 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-6rem)] max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-emerald-950/10 lg:grid-cols-2">
        <section className="hidden bg-gradient-to-br from-[#083f38] via-[#0b6458] to-[#13a58f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[.24em] text-emerald-200">Mega Live Portal</p>
            <h1 className="mt-7 text-5xl font-black leading-tight">Events that live inside your app.</h1>
            <p className="mt-5 max-w-md text-emerald-50/80">Upload, version, publish, and audit complete interactive web experiences.</p>
          </div>
          <p className="text-sm text-emerald-100/70">Independent Events credentials · Secure publishing</p>
        </section>
        <section className="flex items-center p-8 sm:p-14">
          <div className="w-full">
            <p className="text-sm font-bold text-[#0c796b]">EVENTS MANAGEMENT</p>
            <h2 className="mt-2 text-3xl font-black">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-500">Use your Events administrator account.</p>
            <EventsLoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}
