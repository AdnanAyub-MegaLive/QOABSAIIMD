"use client";

import { useActionState, useState } from "react";
import { authenticate } from "./login-actions";

const fieldClass =
  "flex h-[52px] items-center gap-3 rounded-[10px] border border-[#dce7e4] bg-white px-[15px] transition focus-within:border-[#24aa9d] focus-within:shadow-[0_0_0_3px_rgba(36,170,157,.1)]";
const iconClass =
  "h-[18px] w-[18px] shrink-0 fill-none stroke-[#8da19e] stroke-[1.6]";
const inputClass =
  "w-full min-w-0 border-0 bg-transparent text-[13px] text-[#142c2a] outline-none placeholder:text-[#a6b3b1]";

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, formAction, pending] = useActionState(
    authenticate,
    undefined,
  );
  return (
    <form action={formAction}>
      <label
        className="mb-[9px] block text-xs font-bold text-[#142c2a]"
        htmlFor="email"
      >
        Email address
      </label>
      <div className={fieldClass}>
        <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
        <input
          className={inputClass}
          id="email"
          name="email"
          type="email"
          placeholder="admin@megaliveportal.com"
          autoComplete="username"
          required
        />
      </div>
      <div className="mt-5 mb-[9px] flex justify-between">
        <label className="text-xs font-bold text-[#142c2a]" htmlFor="password">
          Password
        </label>
        <a
          className="text-[11px] font-bold text-[#087f74] no-underline"
          href="#"
        >
          Forgot password?
        </a>
      </div>
      <div className={fieldClass}>
        <svg className={iconClass} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        <input
          className={inputClass}
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />
        <button
          className="grid cursor-pointer place-items-center border-0 bg-transparent p-1 text-[#819491]"
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          <svg
            className="h-[18px] w-[18px] fill-none stroke-current stroke-[1.6]"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
            <circle cx="12" cy="12" r="2.5" />
            {showPassword && <path d="m4 4 16 16" />}
          </svg>
        </button>
      </div>
      <label className="my-[18px] flex w-fit cursor-pointer items-center gap-[9px] text-xs font-normal text-[#526561]">
        <input
          className="h-4 w-4 accent-[#087f74]"
          type="checkbox"
          name="remember"
        />
        <span>Keep me signed in</span>
      </label>
      {errorMessage && (
        <p
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
      <button
        className="flex h-[53px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border-0 bg-linear-to-r from-[#087b70] to-[#0b9587] text-[13px] font-bold text-white shadow-[0_12px_25px_rgba(8,127,116,.18)] transition hover:-translate-y-px hover:shadow-[0_15px_30px_rgba(8,127,116,.27)] disabled:cursor-wait disabled:opacity-70"
        type="submit"
        disabled={pending}
      >
        {pending ? "Signing in…" : "Sign in to dashboard"}
        <svg
          className="h-[18px] w-[18px] fill-none stroke-current stroke-[1.8]"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M5 12h14M14 7l5 5-5 5" />
        </svg>
      </button>
    </form>
  );
}
