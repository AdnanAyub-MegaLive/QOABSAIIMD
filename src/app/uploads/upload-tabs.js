"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { durationCalculation } from "../utils/duration";

const tabs = [
  "Banners",
  "Frames",
  "Entrance Strip",
  "Rides",
  "Tail-lights",
  "Gifts",
  "Badges",
  "Chat Boxes",
  "Room Backgrounds",
  "Seat Styles",
  "Business Cards",
  "VIP Stickers",
  "Campaign Widgets",
  "Music",
];
const categories = {
  Banners: "BANNERS",
  Frames: "FRAMES",
  "Entrance Strip": "ENTRANCES",
  Rides: "RIDES",
  "Tail-lights": "TAIL_LIGHTS",
  Gifts: "GIFTS",
  Badges: "BADGES",
  "Chat Boxes": "CHAT_BOXES",
  "Room Backgrounds": "ROOM_BACKGROUNDS",
  "Seat Styles": "SEAT_STYLES",
  "Business Cards": "BUSINESS_CARD",
  "VIP Stickers": "VIP_STICKERS",
  "Campaign Widgets": "CAMPAIGN_WIDGETS",
  Music: "MUSIC_TRACKS",
};
const bannerPlacements = [
  ["PARTY", "Party tab"],
  ["HOT_TOP", "Hot tab — top"],
  ["HOT_MID", "Hot tab — middle"],
];

function bannerPlacementLabel(value) {
  return bannerPlacements.find(([placement]) => placement === value)?.[1] ?? value;
}

export default function UploadTabs({ initialUploads, users }) {
  const [active, setActive] = useState(tabs[0]);
  const [uploads, setUploads] = useState(initialUploads);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [managedAsset, setManagedAsset] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function saveAsset(asset, changes) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/uploads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id, ...changes }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message || "Update failed.");
      setUploads((current) =>
        current.map((item) =>
          item.id === asset.id ? result.data.asset : item,
        ),
      );
      setManagedAsset(null);
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAsset(asset, reason) {
    setDeleting(true);
    setError("");
    try {
      const response=await fetch("/api/uploads",{
        method:"DELETE",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({assetId:asset.id,reason}),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error?.message||"Deletion failed.");
      setUploads((current)=>current.filter((item)=>item.id!==asset.id));
      if(managedAsset?.id===asset.id)setManagedAsset(null);
      setDeleteTarget(null);
    } catch(deleteError) {
      setError(deleteError.message);
    } finally {
      setDeleting(false);
    }
  }

  const records = uploads.filter(
    (item) => item.category === categories[active],
  );
  return (
    <>
      <div
        className="mb-7 overflow-x-auto border-b border-[#dce7e4]"
        role="tablist"
        aria-label="Upload categories"
      >
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActive(tab);
                setError("");
              }}
              className={`relative px-4 py-3 text-xs font-semibold transition ${active === tab ? "text-[#087f74] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#087f74]" : "text-[#71847f] hover:text-[#294a45]"}`}
              role="tab"
              aria-selected={active === tab}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <section role="tabpanel">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold">{active}</h3>
            <p className="mt-1 text-xs text-[#788b86]">
              Database-backed files available to the mobile application.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError("");
              setUploadOpen(true);
            }}
            className="rounded-lg bg-[#087f74] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#066c63]"
          >
            + Add new {singular(active)}
          </button>
        </div>
        {error && (
          <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            {error}
          </p>
        )}
        {records.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {records.map((item, index) => (
              <PreviewCard
                key={item.id}
                item={item}
                eager={index < 4}
                onManage={() => {
                  setError("");
                  setManagedAsset(item);
                }}
                onDelete={() => {
                  setError("");
                  setDeleteTarget(item);
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState active={active} />
        )}
      </section>
      {uploadOpen && (
        <UploadModal
          active={active}
          users={users}
          onClose={() => setUploadOpen(false)}
          onCreated={(asset) => {
            setUploads((current) => [asset, ...current]);
            setUploadOpen(false);
          }}
        />
      )}
      {managedAsset && (
        <AssetManager
          asset={managedAsset}
          users={users}
          saving={saving}
          error={error}
          onClose={() => {
            if (!saving) setManagedAsset(null);
          }}
          onSave={saveAsset}
        />
      )}
      {deleteTarget && (
        <DeleteAssetModal
          asset={deleteTarget}
          deleting={deleting}
          error={error}
          onClose={() => {
            if(!deleting)setDeleteTarget(null);
          }}
          onDelete={deleteAsset}
        />
      )}
    </>
  );
}

function PreviewCard({ item, eager, onManage, onDelete }) {
  const activeGrants = item.assignedUsers.filter((user) => !user.isExpired);
  const isBanner = item.category === "BANNERS";
  return (
    <article className="group overflow-hidden rounded-2xl border border-[#dce8e5] bg-white shadow-[0_7px_22px_rgba(15,65,60,.04)]">
      <div className="aspect-video bg-[#edf4f2]">
        <MediaPreview
          url={item.url}
          type={item.mimeType}
          name={item.name}
          eager={eager}
        />
      </div>
      <div className="p-4">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-bold">{item.name}</h4>
          <p className="mt-1 line-clamp-2 min-h-7 text-[10px] leading-3.5 text-[#82938f]">
            {item.details || "No details added."}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags?.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#f1f5f4] px-2 py-1 text-[9px] text-[#60736f]"
            >
              #{tag}
            </span>
          ))}
          {item.isRoomBackground && (
            <span className="rounded-full bg-violet-50 px-2 py-1 text-[9px] font-bold text-violet-700">
              Room background
            </span>
          )}
          {item.category !== "BANNERS" && (
            <span className="rounded-full bg-sky-50 px-2 py-1 text-[9px] font-bold text-sky-700">
              {distributionLabel(item)}
            </span>
          )}
          {isBanner && item.placement && (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">
              {bannerPlacementLabel(item.placement)} · order {item.sortOrder}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-[#edf2f1] pt-3 text-[9px] text-[#71847f]">
          <span>
            {isBanner
              ? item.actionUrl
                ? "Marketing link configured"
                : "Destination link missing"
              : item.category === "GIFTS"
                ? "Consumable gift catalog"
              : activeGrants.length
              ? `Granted to ${activeGrants.length} user${activeGrants.length === 1 ? "" : "s"}`
              : item.isGlobal
                ? "Available to all users"
                : "No active grants"}
          </span>
          <span>{formatSize(item.fileSize)}</span>
        </div>
        {isBanner && item.actionUrl && (
          <a
            href={item.actionUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block truncate rounded-lg border border-[#d7e5e2] bg-[#f8fbfa] px-3 py-2 text-[9px] font-semibold text-[#087f74] hover:bg-[#edf7f5]"
          >
            Test destination ↗
          </a>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onManage}
            className="rounded-lg bg-[#e7f5f2] px-3 py-2.5 text-[10px] font-bold text-[#087f74] hover:bg-[#d8eeea]"
          >
            Manage
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-rose-200 px-3 py-2.5 text-[10px] font-bold text-rose-700 hover:bg-rose-50"
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function DeleteAssetModal({asset,deleting,error,onClose,onDelete}) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#071f1d]/65 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-asset-title">
      <form
        onSubmit={(event)=>{
          event.preventDefault();
          onDelete(asset,String(new FormData(event.currentTarget).get("reason")));
        }}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="border-b border-[#e5ecea] px-6 py-5">
          <p className="text-[10px] font-bold tracking-widest text-rose-600 uppercase">Permanent deletion</p>
          <h3 id="delete-asset-title" className="mt-1 text-lg font-bold">Delete {asset.name}?</h3>
          <p className="mt-2 text-xs leading-5 text-[#71847f]">The media file and all user assignments will be permanently removed. The mobile application will no longer be able to access this item.</p>
        </div>
        <div className="space-y-4 p-6">
          <label className="block">
            <span className="mb-2 block text-xs font-bold">Reason for deletion</span>
            <textarea name="reason" required maxLength={500} rows={3} placeholder="For example: Uploaded by mistake" className={`${inputClass} h-auto resize-none py-3`}/>
          </label>
          {error&&<p className="rounded-lg bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e5ecea] bg-[#fafcfc] px-6 py-4">
          <button type="button" onClick={onClose} disabled={deleting} className="rounded-lg border border-[#d7e4e1] px-4 py-2.5 text-xs font-bold">Cancel</button>
          <button type="submit" disabled={deleting} className="rounded-lg bg-rose-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">{deleting?"Deleting…":"Delete permanently"}</button>
        </div>
      </form>
    </div>
  );
}

function AssetManager({ asset, users, saving, error, onClose, onSave }) {
  const isBanner = asset.category === "BANNERS";
  const isGift = asset.category === "GIFTS";
  const isMusic = asset.category === "MUSIC_TRACKS";
  const [title, setTitle] = useState(asset.name);
  const [details, setDetails] = useState(asset.details ?? "");
  const [tags, setTags] = useState((asset.tags ?? []).join(", "));
  const [actionUrl, setActionUrl] = useState(asset.actionUrl ?? "");
  const [placement, setPlacement] = useState(asset.placement ?? "PARTY");
  const [sortOrder, setSortOrder] = useState(asset.sortOrder ?? 0);
  const [distribution, setDistribution] = useState(
    asset.distribution === "MARKETING" ? "MANUAL" : asset.distribution ?? "MANUAL",
  );
  const [storeVisible, setStoreVisible] = useState(asset.storeVisible ?? false);
  const [coinPrice, setCoinPrice] = useState(asset.coinPrice ?? "0");
  const [giftTier, setGiftTier] = useState(asset.giftTier ?? "CLASSIC");
  const [senderXp,setSenderXp]=useState(asset.senderXp ?? "0");
  const [receiverXp,setReceiverXp]=useState(asset.receiverXp ?? "0");
  const [minimumVipLevel, setMinimumVipLevel] = useState(
    asset.minimumVipLevel ?? 1,
  );
  const [minimumRecharge, setMinimumRecharge] = useState(
    asset.minimumRecharge ?? "1",
  );
  const [defaultGrantDuration, setDefaultGrantDuration] = useState(
    asset.defaultGrantDurationMinutes ?? null,
  );
  const [grants, setGrants] = useState(
    asset.assignedUsers
      .filter((user) => !user.isExpired)
      .map((user) => ({
        userId: user.id,
        durationMinutes: user.durationMinutes,
        expiresAt: user.expiresAt,
        permanent: !user.expiresAt,
      })),
  );
  const [grantedQuery, setGrantedQuery] = useState("");
  const [assignQuery, setAssignQuery] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(10080);
  const [isRoomBackground, setIsRoomBackground] = useState(
    asset.isRoomBackground,
  );
  const assignedSet = useMemo(
    () => new Set(grants.map((grant) => grant.userId)),
    [grants],
  );
  const granted = users.filter(
    (user) => assignedSet.has(user.id) && matchesUser(user, grantedQuery),
  );
  const available = users.filter(
    (user) => !assignedSet.has(user.id) && matchesUser(user, assignQuery),
  );

  function submit(event) {
    event.preventDefault();
    onSave(asset, {
      name: title.trim(),
      details: details.trim(),
      tags: parseTags(tags),
      ...(isBanner
        ? { actionUrl: actionUrl.trim(), placement, sortOrder: Number(sortOrder) }
        : isGift
          ? { giftTier, coinPrice, senderXp, receiverXp, distribution: "STORE", storeVisible: false }
        : isMusic
          ? { distribution: "FREE", storeVisible: false, isRoomBackground: false }
        : {
            assignmentGrants: grants,
            isRoomBackground,
            distribution,
            storeVisible,
            coinPrice,
            minimumVipLevel,
            minimumRecharge,
            defaultGrantDurationMinutes: defaultGrantDuration,
          }),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#071f1d]/60 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="asset-manager-title"
    >
      <form
        onSubmit={submit}
        className="mx-auto my-2 w-full max-w-4xl rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-[#e1eae8] px-5 py-4 sm:px-7">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-[#16877d] uppercase">
              Asset management
            </p>
            <h3 id="asset-manager-title" className="mt-1 text-lg font-bold">
              Manage {asset.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-xl leading-none text-[#71847f] hover:bg-[#f1f6f5]"
            aria-label="Close asset manager"
          >
            ×
          </button>
        </div>
        <div className="space-y-6 p-5 sm:p-7">
          <div className="aspect-video max-h-[420px] overflow-hidden rounded-xl border border-[#cadbd7] bg-[#edf4f2]">
            <MediaPreview
              url={asset.url}
              type={asset.mimeType}
              name={title || asset.name}
            />
          </div>
          <div className="grid gap-4">
            <Field label="Title">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={80}
                className={inputClass}
              />
            </Field>
            <Field label="Details">
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={2000}
                rows={3}
                className={`${inputClass} h-auto resize-y py-3`}
              />
            </Field>
            <Field label="Tags">
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="premium, animated, summer"
                className={inputClass}
              />
              <p className="mt-1.5 text-[10px] text-[#7b8e89]">
                Separate tags with commas.
              </p>
            </Field>
            {isBanner && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Placement">
                  <select value={placement} onChange={(event) => setPlacement(event.target.value)} required className={inputClass}>
                    {bannerPlacements.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Sort order">
                  <input type="number" min="0" max="1000000" step="1" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} required className={inputClass} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Destination URL (optional)">
                    <input type="url" pattern="https://.*" value={actionUrl} onChange={(event) => setActionUrl(event.target.value)} placeholder="https://example.com/events/agency-drive" className={inputClass} />
                    <p className="mt-1.5 text-[10px] text-[#7b8e89]">HTTPS only. Leave empty when the banner is informational.</p>
                  </Field>
                </div>
              </div>
            )}
          </div>
          {isGift && (
            <GiftCatalogSettings senderXp={senderXp} onSenderXp={setSenderXp} receiverXp={receiverXp} onReceiverXp={setReceiverXp}
              giftTier={giftTier}
              onGiftTier={setGiftTier}
              coinPrice={coinPrice}
              onCoinPrice={setCoinPrice}
            />
          )}
          {!isBanner && !isGift && !isMusic && (
            <DistributionSettings
              distribution={distribution}
              onDistribution={setDistribution}
              storeVisible={storeVisible}
              onStoreVisible={setStoreVisible}
              coinPrice={coinPrice}
              onCoinPrice={setCoinPrice}
              minimumVipLevel={minimumVipLevel}
              onMinimumVipLevel={setMinimumVipLevel}
              minimumRecharge={minimumRecharge}
              onMinimumRecharge={setMinimumRecharge}
              defaultDuration={defaultGrantDuration}
              onDefaultDuration={setDefaultGrantDuration}
            />
          )}
          {!isBanner && !isGift && !isMusic && <UserPanel
            title="Granted to Users"
            query={grantedQuery}
            onQuery={setGrantedQuery}
            placeholder="Search granted users"
            empty={
              grants.length
                ? "No granted users match this search."
                : asset.isGlobal
                  ? "No users are granted this asset. It is currently available to all users."
                  : "There are no active grants. Previous grants may have expired."
            }
          >
            {granted.map((user) => {
              const grant = grants.find((item) => item.userId === user.id);
              return (
                <UserRow
                  key={user.id}
                  user={user}
                  meta={
                    grant?.permanent || !grant?.expiresAt
                      ? "Granted permanently"
                      : `Expires ${formatDate(grant.expiresAt)}`
                  }
                  action="Remove"
                  tone="remove"
                  onAction={() =>
                    setGrants((current) =>
                      current.filter((item) => item.userId !== user.id),
                    )
                  }
                />
              );
            })}
          </UserPanel>}
          {!isBanner && !isGift && !isMusic && <AssignmentPeriod
            value={durationMinutes}
            onChange={setDurationMinutes}
          />}
          {!isBanner && !isGift && !isMusic && <UserPanel
            title="Assign to Users"
            query={assignQuery}
            onQuery={setAssignQuery}
            placeholder="Search users to assign"
            empty="No more users match this search."
          >
            {available.slice(0, 100).map((user) => (
              <UserRow
                key={user.id}
                user={user}
                action="Grant"
                onAction={() =>
                  setGrants((current) => [
                    ...current,
                    {
                      userId: user.id,
                      durationMinutes,
                      expiresAt:
                        durationMinutes === null
                          ? null
                          : new Date(
                              Date.now() + durationMinutes * 60000,
                            ).toISOString(),
                      permanent: durationMinutes === null,
                    },
                  ])
                }
              />
            ))}
          </UserPanel>}
          {!isBanner && !isGift && !isMusic && <label className="flex items-center gap-3 rounded-xl border border-[#d7e5e2] bg-[#f8fbfa] p-4">
            <input
              type="checkbox"
              checked={isRoomBackground}
              onChange={(event) => setIsRoomBackground(event.target.checked)}
              className="h-5 w-5 accent-[#087f74]"
            />
            <span>
              <strong className="block text-sm">Use as a Background</strong>
              <span className="mt-0.5 block text-[10px] text-[#748681]">
                Allow the mobile application to use this asset as an audio-room
                background.
              </span>
            </span>
          </label>}
          {error && (
            <p className="rounded-lg bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 rounded-b-2xl border-t border-[#e1eae8] bg-white px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-[#d3e0dd] px-4 py-2.5 text-xs font-bold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-lg bg-[#087f74] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function UserPanel({ title, query, onQuery, placeholder, empty, children }) {
  return (
    <fieldset className="rounded-xl border border-[#cadbd7] p-3 sm:p-4">
      <legend className="px-2 text-xs font-bold text-[#294a45]">{title}</legend>
      <input
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
      <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
        {children?.length ? (
          children
        ) : (
          <p className="px-2 py-5 text-center text-xs text-[#7b8e89]">
            {empty}
          </p>
        )}
      </div>
    </fieldset>
  );
}

function UserRow({ user, meta, action, tone, onAction }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#e3ecea] px-3 py-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e5f4f1] text-[10px] font-bold text-[#087f74]">
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold">{user.name}</p>
        <p className="truncate text-[9px] text-[#7c8f8a]">
          {user.id} · {user.phone || "No phone"}
        </p>
        {meta && (
          <p className="mt-0.5 truncate text-[9px] font-semibold text-amber-700">
            {meta}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onAction}
        className={`rounded-lg px-3 py-2 text-[10px] font-bold ${tone === "remove" ? "bg-rose-50 text-rose-700 hover:bg-rose-100" : "bg-[#e4f5f2] text-[#087f74] hover:bg-[#d6eeea]"}`}
      >
        {action}
      </button>
    </div>
  );
}

function UploadModal({ active, users, onClose, onCreated }) {
  const isBanner = active === "Banners";
  const isGift = active === "Gifts";
  const isBusinessCard = active === "Business Cards";
  const isMusic = active === "Music";
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [tags, setTags] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [placement, setPlacement] = useState("PARTY");
  const [sortOrder, setSortOrder] = useState(0);
  const [distribution, setDistribution] = useState(isMusic ? "FREE" : "STORE");
  const [storeVisible, setStoreVisible] = useState(true);
  const [coinPrice, setCoinPrice] = useState("0");
  const [giftTier, setGiftTier] = useState("CLASSIC");
  const [senderXp,setSenderXp]=useState("");
  const [receiverXp,setReceiverXp]=useState("");
  const [giftRewardMinBps, setGiftRewardMinBps] = useState("0");
  const [giftRewardMaxBps, setGiftRewardMaxBps] = useState("20000");
  const [minimumVipLevel, setMinimumVipLevel] = useState(1);
  const [minimumRecharge, setMinimumRecharge] = useState("1");
  const [defaultGrantDuration, setDefaultGrantDuration] = useState(null);
  const [file, setFile] = useState(null);
  const [posterFile, setPosterFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [userQuery, setUserQuery] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(10080);
  const [isRoomBackground, setIsRoomBackground] = useState(
    active === "Room Backgrounds",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const previewRef = useRef(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  function chooseFile(event) {
    const nextFile = event.target.files?.[0] ?? null;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const nextUrl = nextFile ? URL.createObjectURL(nextFile) : null;
    previewRef.current = nextUrl;
    setFile(nextFile);
    setPreviewUrl(nextUrl);
    setError("");
  }
  function close() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    onClose();
  }
  async function submit(event) {
    event.preventDefault();
    if (!file) return;
    setSaving(true);
    setError("");
    const form = new FormData();
    form.set("name", name.trim());
    form.set("details", details.trim());
    form.set("tags", JSON.stringify(parseTags(tags)));
    form.set("category", categories[active]);
    form.set("file", file);
    if (posterFile) form.set("posterFile", posterFile);
    form.set("actionUrl", actionUrl.trim());
    if (isBanner) {
      form.set("placement", placement);
      form.set("sortOrder", String(sortOrder));
    }
    if (isGift) {
      form.set("giftTier", giftTier);
      form.set("senderXp",senderXp);
      form.set("receiverXp",receiverXp);
      form.set("giftRewardMinBps", giftRewardMinBps);
      form.set("giftRewardMaxBps", giftRewardMaxBps);
      form.set("coinPrice", String(coinPrice));
      form.set("distribution", "STORE");
      form.set("storeVisible", "false");
    } else if (!isBanner) {
      form.set("assignedUserIds", JSON.stringify(assignedUserIds));
      form.set(
        "assignmentDurationMinutes",
        durationMinutes === null ? "" : String(durationMinutes),
      );
      form.set("assignmentPermanent", String(durationMinutes === null));
      form.set("isRoomBackground", String(isRoomBackground));
      form.set("distribution", distribution);
      form.set("storeVisible", String(storeVisible));
      form.set("coinPrice", String(coinPrice));
      form.set("minimumVipLevel", String(minimumVipLevel));
      form.set("minimumRecharge", String(minimumRecharge));
      form.set(
        "defaultGrantDurationMinutes",
        defaultGrantDuration === null ? "" : String(defaultGrantDuration),
      );
    }
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message || "Upload failed.");
      onCreated(result.data.asset);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setSaving(false);
    }
  }
  const available = users.filter(
    (user) =>
      !assignedUserIds.includes(user.id) && matchesUser(user, userQuery),
  );
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#071f1d]/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-title"
    >
      <form
        onSubmit={submit}
        className="mx-auto my-4 w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-[#e5ecea] px-6 py-5">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-[#16877d] uppercase">
              {active}
            </p>
            <h3 id="upload-title" className="mt-1 text-lg font-bold">
              Add new {singular(active)}
            </h3>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-2 text-xl leading-none text-[#71847f] hover:bg-[#f1f6f5]"
          >
            ×
          </button>
        </div>
        <div className="space-y-4 p-6">
          <Field label="Title">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={80}
              className={inputClass}
            />
          </Field>
          <Field label="Details">
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={2000}
              rows={3}
              className={`${inputClass} h-auto py-3`}
            />
          </Field>
          <Field label="Tags">
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="premium, animated, summer"
              className={inputClass}
            />
          </Field>
          {isBanner && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Placement">
                <select value={placement} onChange={(event) => setPlacement(event.target.value)} required className={inputClass}>
                  {bannerPlacements.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Sort order">
                <input type="number" min="0" max="1000000" step="1" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} required className={inputClass} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Destination URL (optional)">
                  <input type="url" pattern="https://.*" value={actionUrl} onChange={(event) => setActionUrl(event.target.value)} placeholder="https://example.com/events/agency-drive" className={inputClass} />
                  <p className="mt-1.5 text-[10px] text-[#7b8e89]">HTTPS only. Leave empty for an informational banner.</p>
                </Field>
              </div>
              <p className="sm:col-span-2 rounded-lg bg-[#eef8f6] px-3 py-2 text-[10px] leading-4 text-[#4d6c67]">Use rights-approved PNG, JPEG, or WebP artwork. Recommended size: 1200 × 500 px (2.4:1), with important text kept inside a safe inset.</p>
            </div>
          )}
          <Field label="Media file">
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#cbded9] bg-[#f8fbfa] px-5 text-center">
              <strong className="text-xs text-[#087f74]">
                {isMusic ? "Choose an MP3, M4A, AAC, OGG, or WAV file" : "Choose image, GIF, WebP, or video"}
              </strong>
              <span className="mt-1 text-[10px] text-[#849691]">
                Maximum {isMusic ? "50" : "15"} MB
              </span>
              <input
                type="file"
                accept={isMusic ? "audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/x-wav" : isBanner ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"}
                onChange={chooseFile}
                required
                className="sr-only"
              />
            </label>
          </Field>
          {file && (
            <div className="rounded-xl border border-[#dce8e5] p-3">
              <div className="aspect-video overflow-hidden rounded-lg bg-[#edf4f2]">
                <MediaPreview
                  url={previewUrl}
                  type={file.type}
                  name={name || file.name}
                />
              </div>
              <p className="mt-2 text-[10px] text-[#71847f]">
                {file.name} · {formatSize(file.size)}
              </p>
            </div>
          )}
          {isBusinessCard && (
            <Field label="Poster image (required for video cards)">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setPosterFile(event.target.files?.[0] ?? null)} className={inputClass} />
              <p className="mt-1.5 text-[10px] text-[#7b8e89]">PNG, JPEG, or WebP; maximum 5 MB. Used before a video card starts playing.</p>
            </Field>
          )}
          {isGift && (
            <GiftCatalogSettings senderXp={senderXp} onSenderXp={setSenderXp} receiverXp={receiverXp} onReceiverXp={setReceiverXp}
              giftTier={giftTier}
              onGiftTier={setGiftTier}
              coinPrice={coinPrice}
              onCoinPrice={setCoinPrice}
              giftRewardMinBps={giftRewardMinBps}
              onGiftRewardMinBps={setGiftRewardMinBps}
              giftRewardMaxBps={giftRewardMaxBps}
              onGiftRewardMaxBps={setGiftRewardMaxBps}
            />
          )}
          {!isBanner && !isGift && !isMusic && (
            <DistributionSettings
              distribution={distribution}
              onDistribution={setDistribution}
              storeVisible={storeVisible}
              onStoreVisible={setStoreVisible}
              coinPrice={coinPrice}
              onCoinPrice={setCoinPrice}
              minimumVipLevel={minimumVipLevel}
              onMinimumVipLevel={setMinimumVipLevel}
              minimumRecharge={minimumRecharge}
              onMinimumRecharge={setMinimumRecharge}
              defaultDuration={defaultGrantDuration}
              onDefaultDuration={setDefaultGrantDuration}
            />
          )}
          {!isBanner && !isGift && !isMusic && <AssignmentPeriod
            value={durationMinutes}
            onChange={setDurationMinutes}
          />}
          {!isBanner && !isGift && !isMusic && <UserPanel
            title="Assign to Users"
            query={userQuery}
            onQuery={setUserQuery}
            placeholder="Search users to assign"
            empty="No users match this search."
          >
            {available.slice(0, 50).map((user) => (
              <UserRow
                key={user.id}
                user={user}
                action="Grant"
                onAction={() =>
                  setAssignedUserIds((current) => [...current, user.id])
                }
              />
            ))}
          </UserPanel>}
          {!isBanner && !isGift && !isMusic && assignedUserIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {assignedUserIds.map((id) => {
                const user = users.find((item) => item.id === id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      setAssignedUserIds((current) =>
                        current.filter((value) => value !== id),
                      )
                    }
                    className="rounded-full bg-[#e7f5f2] px-3 py-1.5 text-[10px] font-bold text-[#087f74]"
                  >
                    {user?.name ?? id} ×
                  </button>
                );
              })}
            </div>
          )}
          {!isBanner && !isGift && !isMusic && <label className="flex items-center gap-3 rounded-xl border border-[#dce8e5] bg-[#f8fbfa] p-4">
            <input
              type="checkbox"
              checked={isRoomBackground}
              onChange={(event) => setIsRoomBackground(event.target.checked)}
              className="h-5 w-5 accent-[#087f74]"
            />
            <span className="text-xs font-bold">Use as a Background</span>
          </label>}
          {error && (
            <p className="rounded-lg bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e5ecea] px-6 py-4">
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="rounded-lg border border-[#d7e4e1] px-4 py-2.5 text-xs font-bold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              !name.trim() ||
              !file ||
              saving
            }
            className="rounded-lg bg-[#087f74] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40"
          >
            {saving ? "Uploading…" : "Upload asset"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold">{label}</span>
      {children}
    </label>
  );
}
function AssignmentPeriod({ value, onChange }) {
  const presets = [
    ["4320", "3 days"],
    ["10080", "7 days"],
    ["21600", "15 days"],
    ["43200", "30 days"],
  ];
  const preset =
    value === null
      ? "permanent"
      : presets.some(([minutes]) => Number(minutes) === Number(value))
        ? String(value)
        : "custom";
  const [selection, setSelection] = useState(preset);
  function select(event) {
    const next = event.target.value;
    setSelection(next);
    if (next === "permanent") onChange(null);
    else if (next !== "custom") onChange(Number(next));
  }
  return (
    <div className="rounded-xl border border-[#d7e5e2] bg-[#f8fbfa] p-4">
      <label className="mb-2 block text-xs font-bold">
        Assignment time period
      </label>
      <select value={selection} onChange={select} className={inputClass}>
        <option value="permanent">Permanent — no expiration</option>
        {presets.map(([minutes, label]) => (
          <option key={minutes} value={minutes}>
            {label}
          </option>
        ))}
        <option value="custom">Custom time period</option>
      </select>
      {selection === "custom" && (
        <input
          type="number"
          min="1"
          max="5256000"
          step="1"
          required
          value={value || ""}
          onChange={(event) => onChange(Math.floor(Number(event.target.value)))}
          placeholder="Duration in minutes"
          className={`${inputClass} mt-3`}
        />
      )}
      <p className="mt-2 rounded-lg bg-[#e8f5f2] px-3 py-2 text-[11px] font-semibold text-[#176f67]">
        {selection === "permanent"
          ? "Permanent access — this grant does not expire."
          : durationCalculation(value)}
      </p>
      <p className="mt-1.5 text-[9px] text-[#748681]">
        This period is applied when you click Grant. Existing grants keep their
        original expiry.
      </p>
    </div>
  );
}

function GiftCatalogSettings({ senderXp, onSenderXp, receiverXp, onReceiverXp, giftTier, onGiftTier, coinPrice, onCoinPrice, giftRewardMinBps, onGiftRewardMinBps, giftRewardMaxBps, onGiftRewardMaxBps }) {
  return (
    <fieldset className="rounded-xl border border-[#cadbd7] bg-[#f8fbfa] p-4">
      <legend className="px-2 text-xs font-bold text-[#294a45]">
        Gift catalog settings
      </legend>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">{[["Sender XP",senderXp,onSenderXp],["Receiver XP",receiverXp,onReceiverXp]].map(([label,value,setValue])=><Field key={label} label={`${label} (required)`}><input type="number" min="0" max="1000000000000" step="1" required value={value} onChange={e=>setValue(e.target.value)} className={inputClass}/></Field>)}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Gift category">
          <select
            value={giftTier}
            onChange={(event) => onGiftTier(event.target.value)}
            className={inputClass}
          >
            <option value="CLASSIC">Classic</option>
            <option value="PREMIUM">Premium</option>
            <option value="VIP">VIP</option>
            <option value="LUCKY">Lucky Gift</option>
            <option value="BLIND_BOX">Blind Box</option>
          </select>
        </Field>
        <Field label="Unit price (coins)">
          <input
            type="number"
            min="1"
            step="1"
            required
            value={coinPrice}
            onChange={(event) => onCoinPrice(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      {giftTier === "LUCKY" && onGiftRewardMinBps && <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Minimum reward (basis points)"><input type="number" min="0" max="50000" value={giftRewardMinBps} onChange={(event)=>onGiftRewardMinBps(event.target.value)} className={inputClass}/></Field><Field label="Maximum reward (basis points)"><input type="number" min="0" max="50000" value={giftRewardMaxBps} onChange={(event)=>onGiftRewardMaxBps(event.target.value)} className={inputClass}/></Field></div>}
      <p className="mt-3 text-[10px] leading-4 text-[#748681]">
        Gifts are consumable. Users spend this price each time they send one;
        gifts are never owned, assigned, or equipped.
      </p>
    </fieldset>
  );
}

function DistributionSettings({
  distribution,
  onDistribution,
  storeVisible,
  onStoreVisible,
  coinPrice,
  onCoinPrice,
  minimumVipLevel,
  onMinimumVipLevel,
  minimumRecharge,
  onMinimumRecharge,
  defaultDuration,
  onDefaultDuration,
}) {
  return (
    <fieldset className="rounded-xl border border-[#c9ddd8] bg-[#f7fbfa] p-4">
      <legend className="px-2 text-xs font-bold text-[#294a45]">
        Store and ownership rules
      </legend>
      <label className="block">
        <span className="mb-2 block text-xs font-bold">How users obtain it</span>
        <select
          value={distribution}
          onChange={(event) => onDistribution(event.target.value)}
          className={inputClass}
        >
          <option value="FREE">Free for everyone</option>
          <option value="STORE">Buy from Store</option>
          <option value="VIP">VIP level reward</option>
          <option value="SVIP">SVIP / recharge reward</option>
          <option value="RESELLER">Reseller role reward</option>
          <option value="ACTIVITY">Activity or event only</option>
          <option value="MANUAL">Super Admin grant only</option>
        </select>
      </label>
      <div className="mt-3">
        {distribution === "STORE" && (
          <Field label="Store price in coins">
            <input
              type="number"
              min="0"
              step="1"
              required
              value={coinPrice}
              onChange={(event) => onCoinPrice(event.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        {distribution === "VIP" && (
          <Field label="Minimum VIP level">
            <select
              value={minimumVipLevel}
              onChange={(event) =>
                onMinimumVipLevel(Number(event.target.value))
              }
              className={inputClass}
            >
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  VIP {level}
                </option>
              ))}
            </select>
          </Field>
        )}
        {distribution === "SVIP" && (
          <Field label="Minimum total recharge">
            <input
              type="number"
              min="1"
              step="1"
              required
              value={minimumRecharge}
              onChange={(event) => onMinimumRecharge(event.target.value)}
              className={inputClass}
            />
          </Field>
        )}
      </div>
      <label className="mt-4 flex items-start gap-3 rounded-lg border border-[#dbe8e5] bg-white p-3">
        <input
          type="checkbox"
          checked={storeVisible}
          onChange={(event) => onStoreVisible(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#087f74]"
        />
        <span>
          <strong className="block text-xs">Show in Store catalog</strong>
          <span className="mt-0.5 block text-[9px] text-[#748681]">
            Reseller rewards unlock while the user holds the Reseller role. VIP, SVIP, and activity items appear locked until earned.
          </span>
        </span>
      </label>
      <div className="mt-4">
        <AssignmentPeriod
          value={defaultDuration}
          onChange={onDefaultDuration}
        />
        <p className="mt-1 text-[9px] text-[#748681]">
          This is the ownership duration after purchase or automatic unlock.
        </p>
      </div>
    </fieldset>
  );
}
function EmptyState({ active }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-[#cbded9] bg-white px-6 text-center">
      <div>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e4f6f3] text-2xl text-[#087f74]">
          ↑
        </span>
        <h4 className="mt-4 text-sm font-bold">
          No {active.toLowerCase()} uploaded
        </h4>
        <p className="mt-1 text-xs text-[#82938f]">
          Use “Add new” to upload the first {singular(active).toLowerCase()}.
        </p>
      </div>
    </div>
  );
}
function MediaPreview({ url, type, name, eager = false }) {
  return type?.startsWith("audio/") ? (
    <div className="flex h-full w-full items-center justify-center p-6">
      <audio src={url} controls preload="metadata" className="w-full" aria-label={`${name} preview`} />
    </div>
  ) : type?.startsWith("video/") ? (
    <video
      src={url}
      controls
      muted
      className="h-full w-full object-contain"
      aria-label={`${name} preview`}
    />
  ) : (
    <span className="relative block h-full w-full">
      <Image
        src={url}
        alt={`${name} preview`}
        fill
        unoptimized
        loading={eager ? "eager" : "lazy"}
        className="object-contain"
      />
    </span>
  );
}
function matchesUser(user, query) {
  const value = query.trim().toLowerCase();
  return (
    !value ||
    `${user.name} ${user.id} ${user.phone ?? ""}`.toLowerCase().includes(value)
  );
}
function parseTags(value) {
  return [
    ...new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}
function initials(name) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function singular(value) {
  const labels = {
    Banners: "Banner",
    Frames: "Frame",
    "Entrance Strip": "Entrance Strip",
    Rides: "Ride",
    "Tail-lights": "Tail-light",
    Gifts: "Gift",
    Badges: "Badge",
    "Chat Boxes": "Chat Box",
    "Room Backgrounds": "Room Background",
    "Seat Styles": "Seat Style",
    "Business Cards": "Business Card",
    "VIP Stickers": "VIP Sticker",
    "Campaign Widgets": "Campaign Widget",
    Music: "Music Track",
  };
  const normalized = String(value ?? "").trim();
  return labels[normalized] ?? (normalized.replace(/s$/i, "") || "Asset");
}
function formatSize(bytes) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
}
function formatDate(value) {
  return value ? new Date(value).toLocaleString("en-US") : "Never";
}
function distributionLabel(item) {
  if (item.category === "GIFTS")
    return `${item.giftTier ? displayTier(item.giftTier) : "Gift"} · ${item.coinPrice ?? "0"} coins`;
  if (item.distribution === "STORE")
    return `Store · ${item.coinPrice ?? "0"} coins`;
  if (item.distribution === "VIP")
    return `VIP ${item.minimumVipLevel ?? ""}`.trim();
  if (item.distribution === "SVIP")
    return `SVIP · recharge ${item.minimumRecharge ?? ""}`.trim();
  if (item.distribution === "RESELLER") return "Reseller role reward";
  if (item.distribution === "ACTIVITY") return "Activity reward";
  return "Super Admin grant";
}

function displayTier(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
const inputClass =
  "h-11 w-full rounded-lg border border-[#cededb] bg-white px-4 text-sm outline-none transition placeholder:text-[#9aaba7] focus:border-[#2ca89c] focus:ring-2 focus:ring-[#2ca89c]/10";
