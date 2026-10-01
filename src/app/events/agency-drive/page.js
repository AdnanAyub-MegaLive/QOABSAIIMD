import Image from "next/image";

export const metadata = {
  title: "Create Your Agency | Mega Live Portal",
  description:
    "Build your creator network, grow hosts, and earn with Mega Live Portal.",
};

export default function AgencyDrivePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#061f1d] text-white">
      <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,#19a59655,transparent_65%)]" />
      <section className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-5 py-7 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <Image
            src="/stream-line-logo.png"
            alt="Mega Live Portal"
            width={174}
            height={54}
            priority
            className="h-11 w-auto object-contain"
          />
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-bold tracking-[0.18em] text-[#78e5d7] uppercase">
            Agency Program
          </span>
        </header>

        <div className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p className="text-xs font-bold tracking-[0.3em] text-[#53d7c7] uppercase">
              Create. Lead. Grow.
            </p>
            <h1 className="mt-5 max-w-2xl text-4xl leading-[1.08] font-black tracking-tight sm:text-6xl">
              Turn your creator network into an agency.
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-[#bad0cd] sm:text-base">
              Recruit promising hosts, help them reach monthly targets, and
              grow together through the Mega Live Portal Agency Program.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="streamline://agency/create"
                className="rounded-xl bg-[#28c9b8] px-6 py-3.5 text-sm font-black text-[#062522] shadow-[0_14px_35px_rgba(40,201,184,.25)]"
              >
                Apply in Mega Live Portal
              </a>
              <a
                href="#benefits"
                className="rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 text-sm font-bold text-white"
              >
                View benefits
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-5 rounded-[2rem] bg-[#1fbaa8]/15 blur-2xl" />
            <div className="relative rounded-[2rem] border border-white/10 bg-white/[.07] p-6 backdrop-blur sm:p-8">
              <p className="text-xs font-bold tracking-widest text-[#62ddce] uppercase">
                What you unlock
              </p>
              <div id="benefits" className="mt-6 space-y-4">
                {[
                  ["01", "Agency ranking and performance insights"],
                  ["02", "Host targets and monthly salary tracking"],
                  ["03", "A growing community with shared rewards"],
                ].map(([number, label]) => (
                  <div
                    key={number}
                    className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#071f1d]/60 p-4"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#25c6b4]/15 text-xs font-black text-[#68dfd1]">
                      {number}
                    </span>
                    <p className="text-sm font-semibold text-[#e6f2f0]">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-xs leading-5 text-[#91aaa6]">
                Applications are reviewed by the Mega Live Portal operations team.
                Eligibility and program terms may vary by region.
              </p>
            </div>
          </div>
        </div>

        <footer className="border-t border-white/10 py-5 text-center text-[10px] text-[#77938f]">
          © 2026 Mega Live Portal. Agency campaign preview page.
        </footer>
      </section>
    </main>
  );
}
