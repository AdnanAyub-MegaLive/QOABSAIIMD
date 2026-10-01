"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignHostToAgency, updateProfitSplit } from "./actions";

const input = "h-11 w-full rounded-lg border border-[#cededb] bg-white px-3 text-sm outline-none focus:border-[#16877d]";

export default function RulesManager({ rule, agencies, hosts }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function run(work, success) {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await work();
        setMessage(success);
        router.refresh();
      } catch (exception) {
        const code = exception?.message ?? "REQUEST_FAILED";
        setError(
          code.includes("HOST_SPLIT_MUST_TOTAL_100")
            ? "Host, agency, and company percentages must total exactly 100%."
            : code.includes("INVALID_PROFIT_PERCENTAGE")
              ? "Every percentage must be between 0 and 100."
              : "Unable to save this rule. Please verify the supplied values.",
        );
      }
    });
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(event.currentTarget));
          run(() => updateProfitSplit(values), "Profit split updated. New gifts will use the new policy version.");
        }}
        className="rounded-2xl border border-[#dce8e5] bg-white p-6"
      >
        <p className="text-[10px] font-bold tracking-widest text-[#16877d] uppercase">Gift settlement</p>
        <h3 className="mt-1 text-lg font-bold">Profit split</h3>
        <p className="mt-2 text-xs leading-5 text-[#71847f]">The host split must total 100%. Historical gifts keep the policy version used when they were sent.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <PercentField name="hostPercent" label="Host salary" value={rule.hostPercent}/>
          <PercentField name="agencyPercent" label="Agency commission" value={rule.agencyPercent}/>
          <PercentField name="companyPercent" label="Company share" value={rule.companyPercent}/>
        </div>
        <div className="mt-5 rounded-xl border border-[#dce8e5] bg-[#f7fbfa] p-4">
          <PercentField name="normalUserReusablePercent" label="Normal-user reusable gift value" value={rule.normalUserReusablePercent}/>
          <p className="mt-2 text-[10px] leading-4 text-[#71847f]">Normal users receive this portion as reusable coins. It is never placed in a salary or withdrawable balance.</p>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-[#e8efed] pt-5">
          <span className="text-[10px] text-[#748681]">Current policy version: {rule.version}</span>
          <button disabled={pending} className="rounded-lg bg-[#087f74] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{pending ? "Saving…" : "Save rules"}</button>
        </div>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(event.currentTarget));
          run(() => assignHostToAgency(values), "Agency membership updated.");
        }}
        className="rounded-2xl border border-[#dce8e5] bg-white p-6"
      >
        <p className="text-[10px] font-bold tracking-widest text-[#16877d] uppercase">Host eligibility</p>
        <h3 className="mt-1 text-lg font-bold">Agency membership</h3>
        <p className="mt-2 text-xs leading-5 text-[#71847f]">Assign or move a host. A single agency relation guarantees that one host cannot belong to multiple agencies.</p>
        <label className="mt-6 block text-xs font-bold">User or host
          <select name="subject" required defaultValue="" className={`${input} mt-2`}><option value="" disabled>Select an account</option>{hosts.map((host)=><option key={`${host.kind}:${host.id}`} value={`${host.kind}:${host.id}`}>{host.name} · {host.id} · {host.agencyName ?? "No agency"}</option>)}</select>
        </label>
        <label className="mt-4 block text-xs font-bold">Agency
          <select name="agencyId" required defaultValue="" className={`${input} mt-2`}><option value="" disabled>Select an agency</option>{agencies.map((agency)=><option key={agency.id} value={agency.id}>{agency.name} · {agency.id}</option>)}</select>
        </label>
        <label className="mt-4 block text-xs font-bold">Reason
          <textarea name="reason" required maxLength={500} rows={3} className="mt-2 w-full resize-none rounded-lg border border-[#cededb] p-3 text-sm outline-none focus:border-[#16877d]" placeholder="Reason for assignment or transfer"/>
        </label>
        <button disabled={pending || !agencies.length} className="mt-5 w-full rounded-lg bg-[#087f74] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">Assign to agency</button>
      </form>
      {(message || error) && <p className={`xl:col-span-2 rounded-xl px-4 py-3 text-xs font-semibold ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{error || message}</p>}
    </div>
  );
}

function PercentField({ name, label, value }) {
  return <label className="block text-xs font-bold">{label}<span className="relative mt-2 block"><input name={name} type="number" min="0" max="100" step="0.01" required defaultValue={value} className={`${input} pr-9`}/><span className="absolute top-3 right-3 text-xs text-[#71847f]">%</span></span></label>;
}
