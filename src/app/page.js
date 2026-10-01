import LoginForm from "./login-form";
import { auth } from "../../auth";
import { redirect } from "next/navigation";
import BrandLogo from "./components/brand-logo";

function Brand({ mobile = false }) {
  return <BrandLogo light={!mobile} priority className="relative z-10"/>;
}

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/portal");

  return (
    <main className="grid min-h-screen grid-cols-[minmax(420px,1.05fr)_minmax(540px,.95fr)] max-[900px]:block">
      <section
        className="relative flex min-h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_78%_20%,#176e68_0,transparent_35%),linear-gradient(145deg,#092d2c_0%,#0b4b47_55%,#0b6159_100%)] px-[7vw] py-12 text-white max-[900px]:hidden"
        aria-label="Mega Live Portal platform introduction"
      >
        <div className="pointer-events-none absolute top-[28%] -right-[280px] h-[450px] w-[450px] rounded-full border border-[#52decd26] shadow-[inset_0_0_90px_rgba(36,205,185,.08)]" />
        <div className="pointer-events-none absolute bottom-[5%] -left-[120px] h-[190px] w-[190px] rounded-full border border-[#52decd1f]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] bg-size-[55px_55px] opacity-[.13] [mask-image:linear-gradient(to_bottom_right,transparent_10%,black,transparent_90%)]" />
        <Brand />

        <div className="relative z-10 my-auto max-w-[650px]">
          <div className="flex items-center gap-2.5 text-[11px] font-bold tracking-[2.2px] text-[#8aeadf] uppercase">
            <span className="h-px w-[30px] bg-[#52d9c8]" /> Unified streaming
            control
          </div>
          <h1 className="my-6 text-[clamp(48px,5vw,75px)] leading-[1.04] font-semibold tracking-[-4px]">
            Every stream.
            <br />
            One{" "}
            <em className="font-inherit not-italic text-[#55ddcc]">
              command center.
            </em>
          </h1>
          <p className="max-w-[540px] text-[17px] leading-[1.75] text-[#b9d3d0]">
            Manage live video, audio rooms, creators, and your community from
            one beautifully simple workspace.
          </p>

          <div
            className="mt-11 max-w-[570px] rounded-[18px] border border-[#92ece02e] bg-[#04232170] px-6 pt-[22px] pb-[18px] shadow-[0_25px_60px_rgba(0,0,0,.15)] backdrop-blur-[10px]"
            aria-hidden="true"
          >
            <div className="flex items-center gap-[9px] text-xs">
              <span className="h-2 w-2 rounded-full bg-[#45e2c7] shadow-[0_0_0_5px_rgba(69,226,199,.12)]" />
              <strong>Live network</strong>
              <span className="ml-auto text-[10px] text-[#8cb9b3]">
                All systems operational
              </span>
            </div>
            <div className="my-5 flex h-[57px] items-center gap-1.5">
              {[
                38, 64, 45, 78, 56, 88, 68, 94, 58, 76, 42, 67, 51, 82, 61, 73,
                47, 69, 39, 54,
              ].map((height, index) => (
                <i
                  key={index}
                  className="max-w-[7px] min-w-[3px] flex-1 rounded-[5px] bg-linear-to-t from-[#158e82] to-[#56e3d0] opacity-80"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between border-t border-white/8 pt-3.5 text-[10px] text-[#7faaa5]">
              <span>
                <strong className="mr-1 text-[#d5ebe8]">2,847</strong> live
                listeners
              </span>
              <span>
                <strong className="mr-1 text-[#d5ebe8]">156</strong> active
                rooms
              </span>
              <span>
                <strong className="mr-1 text-[#d5ebe8]">99.9%</strong> uptime
              </span>
            </div>
          </div>
        </div>
        <p className="relative z-10 m-0 text-[11px] text-[#769f9b]">
          Built for the people behind the stream.
        </p>
      </section>

      <section className="relative flex min-h-screen items-center justify-center bg-[#f8fbfa] px-[9vw] py-[60px] max-[900px]:px-6 max-[900px]:pt-[110px] max-[900px]:pb-[75px] max-[480px]:items-start max-[480px]:pt-[125px]">
        <div className="absolute top-[30px] left-7 hidden max-[900px]:block">
          <Brand mobile />
        </div>
        <div className="w-full max-w-[430px]">
          <div className="flex w-fit items-center gap-[7px] rounded-lg bg-[#e7f5f2] px-2.5 py-[7px] text-[9px] font-extrabold tracking-[1.35px] text-[#14766d] uppercase">
            <svg
              className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 3 5 6v5c0 4.6 2.9 8.3 7 10 4.1-1.7 7-5.4 7-10V6l-7-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            Admin portal
          </div>
          <h2 className="mt-5 mb-2 text-[38px] leading-[1.2] font-bold tracking-[-1.5px] text-[#142c2a] max-[480px]:text-[32px]">
            Welcome back
          </h2>
          <p className="mb-[34px] text-sm text-[#667875] max-[480px]:mb-[27px]">
            Sign in to manage your streaming platform.
          </p>
          <LoginForm />
          <div className="mt-[31px] flex items-center gap-3 border-t border-[#e3ebe9] pt-6 text-[9px] leading-[1.6] text-[#91a09d]">
            <svg
              className="h-[29px] w-[29px] rounded-full bg-[#e9f5f2] p-[7px] fill-none stroke-[#438c84] stroke-[1.5]"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>
              <strong className="text-[10px] text-[#627470]">
                Secure admin access
              </strong>
              <br />
              Protected by enterprise-grade encryption
            </span>
          </div>
        </div>
        <footer className="absolute bottom-[30px] text-[9px] text-[#9aaba8] max-[480px]:bottom-[22px]">
          © 2026 Mega Live Portal &nbsp;·&nbsp; Privacy &nbsp;·&nbsp; Support
        </footer>
      </section>
    </main>
  );
}
