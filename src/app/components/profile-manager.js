"use client";

import { useState } from "react";
import Image from "next/image";
import {
  adjustUserCoins,
  assignSpecialId,
  createBan,
  deleteUserAccount,
  forceLogoutUser,
  manageUserAssetGrant,
  resetUserPassword,
  revokeSpecialId,
  unbanUser,
  updateTalentAccount,
  updateUserAccount,
} from "../database-actions";

const format = new Intl.NumberFormat("en-US");

export default function ProfileManager({ profile, type }) {
  const isTalent = type === "talent";
  const [data, setData] = useState(profile);
  const [modal, setModal] = useState(null);
  const [officialPending, setOfficialPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const stats = isTalent
    ? [
        ["Gifts received", `${format.format(data.giftsReceived)} coins`],
        ["Salary coin balance", `${format.format(data.salaryCoinBalance)} coins`],
        ["Agency", data.agency],
        ["Followers", format.format(data.followers)],
        ["Monthly salary", `$${format.format(data.salary)}`],
        ["Live hours", `${data.liveHours} hrs`],
      ]
    : [
        ["Total spending", `${format.format(data.totalSpent)} coins`],
        ["Current balance", `${format.format(data.balance)} coins`],
        ["Gifts sent", format.format(data.gifts)],
        ["Gifts received", format.format(data.giftsReceived)],
        ["Reusable gift coins", `${format.format(data.reusableGiftCoins)} coins`],
        ["VIP level", data.vipLevel ? `VIP ${data.vipLevel}` : "None"],
      ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-[#dfe9e7] bg-white p-5"
          >
            <p className="text-[11px] font-semibold text-[#768984]">{label}</p>
            <p className="mt-2 text-xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_.7fr]">
        <section className="rounded-2xl border border-[#dce8e5] bg-white p-6">
          <div className="flex items-center justify-between border-b border-[#edf2f1] pb-4">
            <h2 className="text-base font-bold">Account information</h2>
            <button
              onClick={() => setModal("edit")}
              className="rounded-lg border border-[#cfe1de] px-3 py-2 text-[10px] font-bold text-[#087f74]"
            >
              Edit details
            </button>
          </div>
          <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {(isTalent
              ? [
                  ["Display name", data.name],
                  ["Legal name", data.legalName],
                  ["Host ID", data.id],
                  ["Host type", data.type],
                  ["Email", data.email],
                  ["Phone", data.phone],
                  ["Country", data.country],
                  ["Joined", data.joined],
                ]
              : [
                  ["Full name", data.name],
                  ["User ID", data.id],
                  ["Email", data.email || "—"],
                  ["Phone", data.phone],
                  ["Country", data.country],
                  ["Gender", data.gender],
                  ["Date of birth", data.dob],
                  ["Roles", (data.roles ?? [data.role]).join(", ")],
                  ["Status", data.status],
                  [
                    "Official account",
                    data.isOfficial ? "Official · Blue badge enabled" : "Not official",
                  ],
                  ["Joined", data.joined],
                ]
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] font-bold tracking-wider text-[#899994] uppercase">
                  {label}
                </dt>
                <dd className="mt-1.5 text-xs font-semibold text-[#304944]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-2xl border border-[#dce8e5] bg-white p-6">
          <h2 className="border-b border-[#edf2f1] pb-4 text-base font-bold">
            Management actions
          </h2>
          <div className="mt-5 grid gap-2">
            {isTalent ? (
              <>
                <Action
                  text="Update verification"
                  onClick={() => setModal("verification")}
                />
                <Action
                  text="Adjust salary"
                  onClick={() => setModal("salary")}
                />
                <Action
                  text="Change host status"
                  onClick={() => setModal("status")}
                />
              </>
            ) : (
              <>
                <Action text="Adjust role" onClick={() => setModal("role")} />
                <Action
                  text="Manage VIP level"
                  onClick={() => setModal("vip")}
                />
                <Action
                  text="Add / Remove coins"
                  onClick={() => setModal("coins")}
                />
                <Action
                  text="Manage assigned items"
                  onClick={() => setModal("assets")}
                />
                <Action
                  text={data.activeSpecialId ? "Manage Special ID" : "Assign Special ID"}
                  onClick={() => setModal("specialId")}
                />
                <Action
                  text={data.isBanned ? "Unban user" : "Ban user"}
                  onClick={() => setModal(data.isBanned ? "unban" : "ban")}
                />
                <Action
                  text="Force logout"
                  onClick={() => setModal("forceLogout")}
                />
                <Action
                  text="Reset password"
                  onClick={() => setModal("resetPassword")}
                />
                <Action
                  text="Delete user account"
                  onClick={() => setModal("deleteAccount")}
                />
                <Action
                  text="Change account status"
                  onClick={() => setModal("status")}
                />
                <Action
                  text={
                    officialPending
                      ? "Updating Official Badge…"
                      : data.isOfficial
                        ? "Remove Official Badge"
                        : "Mark as Official"
                  }
                  disabled={officialPending}
                  onClick={async () => {
                    const next = !data.isOfficial;
                    setOfficialPending(true);
                    setActionError("");
                    try {
                      await updateUserAccount(data.id, { isOfficial: next });
                      setData((current) => ({
                        ...current,
                        isOfficial: next,
                        roles: next
                          ? [...new Set([...(current.roles ?? [current.role]), "Official"])]
                          : (current.roles ?? [current.role]).filter((role) => role !== "Official"),
                      }));
                    } catch {
                      setActionError("Unable to update the official-account badge.");
                    } finally {
                      setOfficialPending(false);
                    }
                  }}
                />
              </>
            )}
            {actionError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-700">
                {actionError}
              </p>
            )}
          </div>
        </section>
      </div>
      <section className="mt-6 rounded-2xl border border-[#dce8e5] bg-white p-6">
        <h2 className="text-base font-bold">Device and login information</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Last login", data.lastLogin || "Never"],
            ["Last login IP", data.ip],
            ["MAC address", data.mac],
            ["Location", data.location],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-bold tracking-wider text-[#899994] uppercase">
                {label}
              </p>
              <p className="mt-1.5 break-all text-xs font-semibold text-[#304944]">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>
      {!isTalent && (
        <AssignedAssets
          assets={data.assignedAssets ?? []}
          onManage={() => setModal("assets")}
        />
      )}
      {modal && (
        modal === "assets" ? (
          <AssetGrantModal
            profile={data}
            onClose={() => setModal(null)}
            onChanged={(asset, result) => {
              setData((current) => ({
                ...current,
                assignedAssets: result.revoked
                  ? current.assignedAssets.filter((item) => item.id !== asset.id)
                  : [
                      {
                        ...asset,
                        assignedAt: new Date(result.assignedAt).toLocaleDateString("en-US"),
                        assignedAtIso: result.assignedAt,
                        expiresAt: result.expiresAt
                          ? new Date(result.expiresAt).toLocaleString("en-US")
                          : "Never",
                        expiresAtIso: result.expiresAt,
                        durationMinutes: result.durationMinutes,
                        source: "ADMIN",
                      },
                      ...current.assignedAssets.filter((item) => item.id !== asset.id),
                    ],
              }));
            }}
          />
        ) : ["specialId", "ban", "unban", "forceLogout", "resetPassword", "deleteAccount"].includes(modal) ? (
          <ProfileActionModal
            type={modal}
            profile={data}
            onClose={() => setModal(null)}
            onChanged={(updates) =>
              setData((current) => ({ ...current, ...updates }))
            }
          />
        ) : (
          <ManageModal
            type={modal}
            profile={data}
            isTalent={isTalent}
            onClose={() => setModal(null)}
            onSave={async (updates) => {
              if (updates.coinAdjustment) {
                const balance = await adjustUserCoins(
                  data.id,
                  updates.coinAdjustment.operation,
                  updates.coinAdjustment.amount,
                  updates.coinAdjustment.reason,
                );
                setData((current) => ({ ...current, balance }));
              } else {
                await (isTalent
                  ? updateTalentAccount(data.id, updates)
                  : updateUserAccount(data.id, updates));
                setData((current) => ({ ...current, ...updates }));
              }
              setModal(null);
            }}
          />
        )
      )}
    </>
  );
}

function ProfileActionModal({ type, profile, onClose, onChanged }) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("10080");
  const [customMinutes, setCustomMinutes] = useState(120);
  const [definitionId, setDefinitionId] = useState(
    profile.specialIdCatalog?.[0]?.id ?? "",
  );
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const titles = {
    specialId: "Manage Special ID",
    ban: "Ban user",
    unban: "Unban user",
    forceLogout: "Force logout",
    resetPassword: "Reset user password",
    deleteAccount: "Delete user account",
  };
  const minutes = duration === "custom" ? Number(customMinutes) : Number(duration);

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      if (type === "ban") {
        await createBan({
          publicId: profile.id,
          target: "USER",
          reason,
          durationMinutes: duration === "permanent" ? null : minutes,
          permanent: duration === "permanent",
        });
        onChanged({
          isBanned: true,
          status: "Banned",
          banReason: reason,
          banExpiresAt:
            duration === "permanent"
              ? null
              : new Date(Date.now() + minutes * 60_000).toISOString(),
        });
      } else if (type === "unban") {
        await unbanUser(profile.id, reason);
        onChanged({ isBanned: false, status: "Active", banReason: null, banExpiresAt: null });
      } else if (type === "forceLogout") {
        await forceLogoutUser(profile.id, reason);
      } else if (type === "resetPassword") {
        const result = await resetUserPassword(profile.id, reason);
        setTemporaryPassword(result.temporaryPassword);
        return;
      } else if (type === "deleteAccount") {
        await deleteUserAccount(profile.id, reason);
        window.location.assign("/users");
        return;
      } else if (type === "specialId") {
        if (profile.activeSpecialId) {
          await revokeSpecialId(profile.activeSpecialId.assignmentId, reason);
          onChanged({ activeSpecialId: null });
        } else {
          const result = await assignSpecialId(profile.id, definitionId, minutes, reason);
          onChanged({
            activeSpecialId: {
              assignmentId: result.id,
              code: result.specialId,
              expiresAt: result.expiresAt,
            },
          });
        }
      }
      onClose();
    } catch (cause) {
      setError(cause?.message || "Unable to complete this action.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#061c1a]/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-[500px] rounded-2xl bg-white shadow-2xl">
        <div className="flex justify-between border-b border-[#e5ecea] px-6 py-5">
          <div>
            <h2 className="text-lg font-bold">{titles[type]}</h2>
            <p className="mt-1 text-xs text-[#748782]">{profile.name} · {profile.id}</p>
          </div>
          <button onClick={onClose} className="text-xl" aria-label="Close">×</button>
        </div>
        {temporaryPassword ? (
          <div className="p-6">
            <p className="text-xs text-[#647b76]">Share this temporary password securely. It will not be shown again.</p>
            <div className="mt-4 rounded-xl bg-amber-50 p-5 text-center font-mono text-2xl font-bold">{temporaryPassword}</div>
            <button type="button" onClick={() => navigator.clipboard.writeText(temporaryPassword)} className="mt-3 h-10 w-full rounded-lg border text-xs font-bold">Copy password</button>
            <button type="button" onClick={onClose} className="mt-2 h-10 w-full rounded-lg bg-[#087f74] text-xs font-bold text-white">Close</button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-6">
            {type === "specialId" && !profile.activeSpecialId && (
              <label className="block text-xs font-bold">
                Available Special ID
                <select required value={definitionId} onChange={(event) => setDefinitionId(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#dce6e4] bg-white px-3 text-xs font-normal">
                  <option value="" disabled>Select an ID</option>
                  {(profile.specialIdCatalog ?? []).map((item) => (
                    <option key={item.id} value={item.id}>{item.code} · {item.category}</option>
                  ))}
                </select>
              </label>
            )}
            {type === "specialId" && profile.activeSpecialId && (
              <p className="rounded-lg bg-[#eff9f7] p-4 text-xs font-semibold text-[#087f74]">
                Current Special ID: {profile.activeSpecialId.code}. This action will revoke it and restore {profile.id}.
              </p>
            )}
            {["ban", "specialId"].includes(type) && !(type === "specialId" && profile.activeSpecialId) && (
              <>
                <label className="mt-4 block text-xs font-bold">
                  Time period
                  <select value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#dce6e4] bg-white px-3 text-xs font-normal">
                    {type === "ban" && <option value="permanent">Permanent</option>}
                    <option value="4320">3 days</option>
                    <option value="10080">7 days</option>
                    <option value="21600">15 days</option>
                    <option value="43200">30 days</option>
                    <option value="custom">Custom minutes</option>
                  </select>
                </label>
                {duration === "custom" && (
                  <input type="number" min="1" value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} className="mt-3 h-11 w-full rounded-lg border border-[#dce6e4] px-3 text-xs" />
                )}
                <p className="mt-2 text-[10px] font-semibold text-[#087f74]">
                  {duration === "permanent" ? "Permanent" : `${minutes} minutes = ${formatDuration(minutes)}`}
                </p>
              </>
            )}
            {type === "deleteAccount" && (
              <p className="rounded-lg bg-red-50 p-4 text-xs text-red-700">This permanently disables and anonymizes the account.</p>
            )}
            {type === "ban" && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">The user will immediately lose application access but will remain in portal records.</p>}
            <label className="mt-4 block text-xs font-bold">
              Administrative reason
              <textarea required value={reason} onChange={(event) => setReason(event.target.value)} rows="3" className="mt-2 w-full resize-none rounded-lg border border-[#dce6e4] p-3 text-xs font-normal" />
            </label>
            {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-2 border-t border-[#e8efed] pt-5">
              <button type="button" onClick={onClose} className="h-10 rounded-lg border px-4 text-xs font-bold">Cancel</button>
              <button disabled={pending || !reason.trim() || (type === "specialId" && !profile.activeSpecialId && !definitionId)} className={`h-10 rounded-lg px-5 text-xs font-bold text-white disabled:opacity-50 ${["ban", "deleteAccount"].includes(type) ? "bg-red-600" : "bg-[#087f74]"}`}>
                {pending ? "Working…" : type === "specialId" ? (profile.activeSpecialId ? "Revoke Special ID" : "Assign Special ID") : titles[type]}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AssetGrantModal({ profile, onClose, onChanged }) {
  const catalog = profile.assetCatalog ?? [];
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(catalog[0]?.id ?? "");
  const [duration, setDuration] = useState("permanent");
  const [customMinutes, setCustomMinutes] = useState(120);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selected = catalog.find((asset) => asset.id === selectedId);
  const assignment = profile.assignedAssets?.find(
    (asset) => asset.id === selectedId,
  );
  const filtered = catalog.filter((asset) =>
    `${asset.name} ${asset.id} ${asset.category}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const durationMinutes =
    duration === "custom" ? Number(customMinutes) : Number(duration);

  async function apply(revoke) {
    if (!selected || !reason.trim()) return;
    setPending(true);
    setError("");
    try {
      const result = await manageUserAssetGrant(profile.id, selected.id, {
        revoke,
        permanent: duration === "permanent",
        durationMinutes,
        reason,
      });
      onChanged(selected, result);
      if (revoke) setReason("");
    } catch (cause) {
      setError(
        cause?.message === "SUPER_ADMIN_REQUIRED"
          ? "Only a Super Admin can manually grant or revoke uploaded items."
          : cause?.message || "Unable to update this item.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#061c1a]/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#e5ecea] bg-white px-6 py-5">
          <div>
            <h2 className="text-lg font-bold">Manage user props and uploads</h2>
            <p className="mt-1 text-xs text-[#748782]">
              {profile.name} · {profile.id}
            </p>
          </div>
          <button onClick={onClose} className="text-xl" aria-label="Close">
            ×
          </button>
        </div>
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_0.85fr]">
          <section>
            <label className="text-xs font-bold">
              Search uploaded items
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, ID, or category"
                className="mt-2 h-11 w-full rounded-lg border border-[#dce6e4] px-3 text-xs font-normal"
              />
            </label>
            <div className="mt-4 grid max-h-[430px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {filtered.map((asset) => {
                const owned = profile.assignedAssets?.some(
                  (item) => item.id === asset.id,
                );
                return (
                  <button
                    type="button"
                    key={asset.id}
                    onClick={() => setSelectedId(asset.id)}
                    className={`rounded-xl border p-3 text-left ${selectedId === asset.id ? "border-[#087f74] bg-[#eff9f7]" : "border-[#dce8e5]"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold">{asset.name}</span>
                      {owned && (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[8px] font-bold text-emerald-700">
                          Granted
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[9px] text-[#78908a]">
                      {asset.category} · {asset.id}
                    </p>
                  </button>
                );
              })}
              {!filtered.length && (
                <p className="col-span-full rounded-xl border border-dashed p-8 text-center text-xs text-[#78908a]">
                  No assignable uploaded items match this search.
                </p>
              )}
            </div>
          </section>
          <section className="rounded-xl border border-[#dce8e5] bg-[#fbfdfd] p-5">
            {selected ? (
              <>
                <div className="aspect-video overflow-hidden rounded-xl bg-[#edf4f2]">
                  <AssetPreview asset={selected} />
                </div>
                <h3 className="mt-4 text-sm font-bold">{selected.name}</h3>
                <p className="mt-1 text-[10px] text-[#78908a]">
                  {selected.category} · {selected.fileName}
                </p>
                {assignment && (
                  <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-[10px] text-emerald-800">
                    Currently granted by {assignment.source}. Expires: {assignment.expiresAt}.
                  </div>
                )}
                <label className="mt-4 block text-xs font-bold">
                  Grant period
                  <select
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                    className="mt-2 h-11 w-full rounded-lg border border-[#dce6e4] bg-white px-3 text-xs font-normal"
                  >
                    <option value="permanent">Permanent</option>
                    <option value="4320">3 days</option>
                    <option value="10080">7 days</option>
                    <option value="21600">15 days</option>
                    <option value="43200">30 days</option>
                    <option value="custom">Custom minutes</option>
                  </select>
                </label>
                {duration === "custom" && (
                  <label className="mt-3 block text-xs font-bold">
                    Custom time in minutes
                    <input
                      type="number"
                      min="1"
                      value={customMinutes}
                      onChange={(event) => setCustomMinutes(event.target.value)}
                      className="mt-2 h-11 w-full rounded-lg border border-[#dce6e4] px-3 text-xs font-normal"
                    />
                  </label>
                )}
                <p className="mt-2 text-[10px] font-semibold text-[#087f74]">
                  {duration === "permanent"
                    ? "Permanent access — this grant does not expire."
                    : `${durationMinutes} minutes = ${formatDuration(durationMinutes)}`}
                </p>
                <label className="mt-4 block text-xs font-bold">
                  Administrative reason
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows="3"
                    required
                    className="mt-2 w-full resize-none rounded-lg border border-[#dce6e4] p-3 text-xs font-normal"
                  />
                </label>
                {error && (
                  <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                    {error}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[#e5ecea] pt-4">
                  {assignment && (
                    <button
                      type="button"
                      disabled={pending || !reason.trim()}
                      onClick={() => apply(true)}
                      className="h-10 rounded-lg border border-red-200 px-4 text-xs font-bold text-red-700 disabled:opacity-50"
                    >
                      Revoke item
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending || !reason.trim() || (duration !== "permanent" && (!Number.isInteger(durationMinutes) || durationMinutes < 1))}
                    onClick={() => apply(false)}
                    className="h-10 rounded-lg bg-[#087f74] px-5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {pending ? "Saving…" : assignment ? "Update grant" : "Grant item"}
                  </button>
                </div>
              </>
            ) : (
              <p className="py-20 text-center text-xs text-[#78908a]">
                Select an uploaded item.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 1) return "Invalid time";
  if (minutes >= 525600 && minutes % 525600 === 0)
    return `${minutes / 525600} year${minutes === 525600 ? "" : "s"}`;
  if (minutes >= 43200 && minutes % 43200 === 0)
    return `${minutes / 43200} month${minutes === 43200 ? "" : "s"}`;
  if (minutes >= 1440 && minutes % 1440 === 0)
    return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes >= 60 && minutes % 60 === 0)
    return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function AssignedAssets({ assets, onManage }) {
  return (
    <section className="mt-6 rounded-2xl border border-[#dce8e5] bg-white p-6">
      <div className="flex flex-col gap-2 border-b border-[#edf2f1] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-bold">Assigned assets</h2>
          <p className="mt-1 text-[10px] text-[#7d908b]">
            Backgrounds, frames, badges, gifts, and other uploaded items
            allotted to this user.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-fit rounded-full bg-[#e8f6f3] px-2.5 py-1 text-[9px] font-bold text-[#087f74]">
            {assets.length} assigned
          </span>
          <button
            onClick={onManage}
            className="rounded-lg bg-[#087f74] px-3 py-2 text-[10px] font-bold text-white"
          >
            Assign or revoke items
          </button>
        </div>
      </div>
      {assets.length ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((asset) => (
            <article
              key={asset.id}
              className="overflow-hidden rounded-xl border border-[#dce8e5] bg-[#fbfdfd]"
            >
              <div className="aspect-video bg-[#edf4f2]">
                <AssetPreview asset={asset} />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-xs font-bold">{asset.name}</h3>
                    <p className="mt-1 truncate text-[9px] text-[#849691]">
                      {asset.fileName}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#e8f6f3] px-2 py-1 text-[8px] font-bold text-[#087f74]">
                    {asset.category}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {asset.isRoomBackground && (
                    <span className="rounded-full bg-violet-50 px-2 py-1 text-[8px] font-bold text-violet-700">
                      Room background
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-semibold text-slate-600">
                    {formatFileSize(asset.fileSize)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[#e8efed] pt-3">
                  <span className="text-[8px] text-[#8b9b97]">
                    Assigned {asset.assignedAt}
                  </span>
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9px] font-bold text-[#087f74]"
                  >
                    Open preview ↗
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-[#cbded9] bg-[#f8fbfa] px-6 py-12 text-center">
          <p className="text-xs font-bold text-[#526b67]">
            No uploaded assets assigned
          </p>
          <p className="mt-1 text-[10px] text-[#879792]">
            Use “Assign or revoke items” to grant one directly from this profile.
          </p>
        </div>
      )}
    </section>
  );
}

function AssetPreview({ asset }) {
  return asset.mimeType.startsWith("video/") ? (
    <video
      src={asset.url}
      controls
      muted
      className="h-full w-full object-cover"
      aria-label={`${asset.name} preview`}
    />
  ) : (
    <span className="relative block h-full w-full">
      <Image
        src={asset.url}
        alt={`${asset.name} preview`}
        fill
        unoptimized
        className="object-cover"
      />
    </span>
  );
}

function formatFileSize(bytes) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
}

function Action({ text, onClick, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-between rounded-xl border border-[#e0eae8] px-4 py-3 text-left text-xs font-semibold text-[#405853] hover:border-[#add3cd] hover:bg-[#f4f9f8] disabled:cursor-wait disabled:opacity-50"
    >
      {text}
      <span>→</span>
    </button>
  );
}

function ManageModal({ type, profile, isTalent, onClose, onSave }) {
  const roleChoices = ["Listener", "Sender", "Creator", "Host", "Moderator", "Official", "BD", "Admin", "Junior Admin", "Senior Admin", "Super Admin", "Country Head", "Manager"];
  const [roles, setRoles] = useState(profile.roles?.length ? profile.roles : [profile.role]);
  const [value, setValue] = useState(
    type === "vip"
      ? profile.vipLevel
      : type === "role"
        ? profile.role
        : type === "status"
          ? profile.status
          : type === "verification"
            ? profile.verification
            : "",
  );
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const auditReason = String(form.get("reason") || "");
    if (type === "vip") onSave({ vipLevel: Number(value), auditReason });
    else if (type === "role") {
      if (!roles.length) return;
      onSave({ roles, isOfficial: roles.includes("Official"), auditReason });
    }
    else if (type === "status") onSave({ status: value, auditReason });
    else if (type === "verification")
      onSave({ verification: value, auditReason });
    else if (type === "salary") onSave({ salary: Number(value), auditReason });
    else if (type === "coins")
      onSave({
        coinAdjustment: {
          operation: form.get("operation"),
          amount: Number(form.get("amount")),
          reason: form.get("reason"),
        },
      });
    else if (type === "edit")
      onSave({
        name: form.get("name"),
        email: form.get("email"),
        phone: form.get("phone"),
        country: form.get("country"),
      });
  }
  const titles = {
    edit: "Edit account details",
    role: "Adjust user role",
    vip: "Manage VIP level",
    coins: "Manage coin balance",
    status: "Change account status",
    verification: "Update verification",
    salary: "Adjust salary",
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#061c1a]/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-[470px] rounded-2xl bg-white shadow-2xl">
        <div className="flex justify-between border-b border-[#e5ecea] px-6 py-5">
          <div>
            <h2 className="text-lg font-bold">{titles[type]}</h2>
            <p className="mt-1 text-xs text-[#748782]">
              {profile.name} · {profile.id}
            </p>
          </div>
          <button onClick={onClose} className="text-xl">
            ×
          </button>
        </div>
        <form onSubmit={submit} className="p-6">
          {type === "edit" ? (
            <div className="grid gap-4">
              <Input
                name="name"
                label={isTalent ? "Display name" : "Full name"}
                value={profile.name}
              />
              <Input
                name="email"
                label="Email"
                value={profile.email}
                type="email"
              />
              <Input name="phone" label="Phone" value={profile.phone} />
              <Input name="country" label="Country" value={profile.country} />
            </div>
          ) : type === "coins" ? (
            <>
              <Select
                label="Operation"
                name="operation"
                options={["add", "remove"]}
              />
              <Input label="Coin amount" name="amount" type="number" />
              <Reason />
            </>
          ) : (
            <>
              <label className="mb-2 block text-xs font-bold">New value</label>
              {type === "role" ? (
                <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                  {roleChoices.map((role) => (
                    <label key={role} className="flex items-center gap-2 rounded-lg border border-[#dce8e5] px-3 py-2.5 text-xs font-semibold">
                      <input
                        type="checkbox"
                        checked={roles.includes(role)}
                        onChange={() => setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role])}
                        className="accent-[#087f74]"
                      />
                      {role}
                    </label>
                  ))}
                  {!roles.length && <p className="text-[10px] font-semibold text-red-600">Select at least one role.</p>}
                </div>
              ) : type === "salary" ? (
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  type="number"
                  min="0"
                  required
                  className="h-11 w-full rounded-lg border border-[#dce6e4] px-3 text-xs"
                />
              ) : (
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="h-11 w-full rounded-lg border border-[#dce6e4] bg-white px-3 text-xs"
                >
                  {(type === "vip"
                    ? [0, 1, 2, 3, 4, 5]
                    : type === "verification"
                        ? ["Pending", "Review", "Verified", "Rejected"]
                        : ["Active", "Pending", "Suspended", "Banned"]
                  ).map((option) => (
                    <option key={option} value={option}>
                      {type === "vip"
                        ? option
                          ? `VIP ${option}`
                          : "Remove VIP"
                        : option}
                    </option>
                  ))}
                </select>
              )}
              <Reason />
            </>
          )}
          <div className="mt-6 flex justify-end gap-2 border-t border-[#e8efed] pt-5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-lg border px-4 text-xs font-bold"
            >
              Cancel
            </button>
            <button className="h-10 rounded-lg bg-[#087f74] px-5 text-xs font-bold text-white">
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function Input({ label, name, value, type = "text" }) {
  return (
    <label className="text-xs font-bold">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={name !== "email" || Boolean(value)}
        min={type === "number" ? 1 : undefined}
        className="mt-2 h-11 w-full rounded-lg border border-[#dce6e4] px-3 text-xs font-normal"
      />
    </label>
  );
}
function Select({ label, name, options }) {
  return (
    <label className="mb-4 block text-xs font-bold">
      {label}
      <select
        name={name}
        className="mt-2 h-11 w-full rounded-lg border border-[#dce6e4] bg-white px-3 text-xs font-normal"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
function Reason() {
  return (
    <label className="mt-4 block text-xs font-bold">
      Reason
      <textarea
        name="reason"
        required
        rows="3"
        className="mt-2 w-full resize-none rounded-lg border border-[#dce6e4] p-3 text-xs font-normal"
        placeholder="Explain this change..."
      />
    </label>
  );
}
