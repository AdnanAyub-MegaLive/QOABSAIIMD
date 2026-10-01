"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function MessageHistory({
  profile,
  worldMessages,
  roomMessages,
  directConversations,
  notifications,
}) {
  const [query, setQuery] = useState("");
  const [selectedConversation, setSelectedConversation] = useState(null);
  const records = useMemo(
    () =>
      [
        ...worldMessages.map((message) => ({
          key: `world-${message.messageId}`,
          type: "World Chat",
          activity: `${profile.name} (${profile.id})`,
          details: message.body,
          reference: message.messageId,
          createdAt: message.createdAt,
          timestamp: message.timestamp,
          searchText: `${message.body} ${message.messageId} ${profile.name} ${profile.id} world chat`,
        })),
        ...roomMessages.map((message) => ({
          key: `room-${message.messageId}`,
          type: "Room Chat",
          activity: `${message.roomTitle} (${message.roomId})`,
          details: message.body,
          reference: message.messageId,
          createdAt: message.createdAt,
          timestamp: message.timestamp,
          searchText: `${message.body} ${message.messageId} ${message.roomTitle} ${message.roomId} ${profile.name} ${profile.id} room chat`,
        })),
        ...directConversations.map((conversation) => ({
          key: `direct-${conversation.id}`,
          type: "Direct Conversation",
          activity: `${conversation.profiledUser.name} (${conversation.profiledUser.id}) → ${
            conversation.otherUser
              ? `${conversation.otherUser.name} (${conversation.otherUser.id})`
              : "Deleted user"
          }`,
          details: `${conversation.messages.length} stored message${
            conversation.messages.length === 1 ? "" : "s"
          }`,
          reference: conversation.id,
          createdAt: conversation.lastActivity,
          timestamp: conversation.timestamp,
          conversation,
          otherUser: conversation.otherUser,
          searchText: [
            conversation.id,
            conversation.profiledUser.name,
            conversation.profiledUser.id,
            conversation.otherUser?.name,
            conversation.otherUser?.id,
            ...conversation.messages.flatMap((message) => [
              message.body,
              message.senderName,
              message.senderId,
              message.id,
            ]),
          ]
            .filter(Boolean)
            .join(" "),
        })),
        ...notifications.map((notification) => ({
          key: `notification-${notification.messageId}`,
          type: "Notification",
          activity: notification.scope,
          details: `${notification.title}: ${notification.body}`,
          reference: notification.messageId,
          createdAt: notification.createdAt,
          timestamp: notification.timestamp,
          searchText: `${notification.title} ${notification.body} ${notification.scope} ${notification.messageId}`,
        })),
      ].sort((left, right) => right.timestamp - left.timestamp),
    [directConversations, notifications, profile, roomMessages, worldMessages],
  );
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value
      ? records.filter((record) =>
          `${record.type} ${record.searchText}`.toLowerCase().includes(value),
        )
      : records;
  }, [query, records]);

  return (
    <>
      <section className="mt-8 rounded-2xl border border-[#dce8e5] bg-white p-5 shadow-[0_8px_25px_rgba(17,61,57,.04)] md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] text-[#16877d] uppercase">
              Private admin view
            </p>
            <h2 className="mt-1 text-lg font-bold">Messaging history</h2>
            <p className="mt-1 text-xs text-[#748782]">
              World Chat and audio-room messages sent by this user, grouped
              private conversations, and system notifications.
            </p>
          </div>
          <label className="block w-full md:max-w-sm">
            <span className="sr-only">Search message history</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search any message word, user, or ID"
              className="h-11 w-full rounded-xl border border-[#cededb] bg-[#f8fbfa] px-4 text-xs outline-none focus:border-[#2ca89c] focus:ring-2 focus:ring-[#2ca89c]/10"
            />
          </label>
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-[#e1ebe9]">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="bg-[#f3f8f7] text-[10px] tracking-wider text-[#657a75] uppercase">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Last activity</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f1]">
              {filtered.map((record) => (
                <tr key={record.key}>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[#e7f5f2] px-2.5 py-1 text-[9px] font-bold text-[#087f74]">
                      {record.type}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-3 font-semibold">
                    {record.conversation ? (
                      <>
                        {record.conversation.profiledUser.name} (
                        {record.conversation.profiledUser.id}) {" → "}
                        {record.otherUser ? (
                          <Link
                            href={`/users/${encodeURIComponent(record.otherUser.id)}`}
                            target="_blank"
                            className="text-[#087f74] underline decoration-[#087f74]/30 underline-offset-2 hover:decoration-[#087f74]"
                          >
                            {record.otherUser.name} ({record.otherUser.id})
                          </Link>
                        ) : (
                          "Deleted user"
                        )}
                      </>
                    ) : (
                      record.activity
                    )}
                  </td>
                  <td className="max-w-md px-4 py-3 text-[#334d49]">
                    <p className="line-clamp-2 whitespace-pre-wrap">
                      {record.details}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-[#71847f]">
                    {record.reference}
                  </td>
                  <td className="px-4 py-3 text-[#71847f]">
                    {record.createdAt}
                  </td>
                  <td className="px-4 py-3">
                    {record.conversation ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedConversation(record.conversation)
                        }
                        className="rounded-lg bg-[#087f74] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#066c63]"
                      >
                        View conversation
                      </button>
                    ) : (
                      <span className="text-[#a1afac]">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td
                    colSpan="6"
                    className="px-5 py-14 text-center text-[#7d908b]"
                  >
                    {query
                      ? "No messaging records match those words."
                      : "No messaging history has been stored for this user yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-[#81928e]">
          Showing {filtered.length} of {records.length} clean activity records.
          Private chats are grouped into one row per conversation.
        </p>
      </section>
      {selectedConversation && (
        <ConversationModal
          conversation={selectedConversation}
          onClose={() => setSelectedConversation(null)}
        />
      )}
    </>
  );
}

function ConversationModal({ conversation, onClose }) {
  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-[#071f1d]/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conversation-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto my-6 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-[#e1eae8] px-5 py-4 sm:px-7">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-[#16877d] uppercase">
              Direct conversation · {conversation.id}
            </p>
            <h3 id="conversation-title" className="mt-1 text-lg font-bold">
              {conversation.profiledUser.name} ({conversation.profiledUser.id})
              {" → "}
              {conversation.otherUser ? (
                <Link
                  href={`/users/${encodeURIComponent(conversation.otherUser.id)}`}
                  target="_blank"
                  className="text-[#087f74] underline decoration-[#087f74]/30 underline-offset-4 hover:decoration-[#087f74]"
                >
                  {conversation.otherUser.name} ({conversation.otherUser.id})
                </Link>
              ) : (
                "Deleted user"
              )}
            </h3>
            <p className="mt-1 text-xs text-[#748782]">
              Both sides of this private conversation are shown below.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-xl leading-none text-[#71847f] hover:bg-[#f1f6f5]"
            aria-label="Close conversation"
          >
            ×
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto bg-[#f5f9f8] p-5 sm:p-7">
          {conversation.messages.map((message) => {
            const isProfiledUser =
              message.senderId === conversation.profiledUser.id;
            return (
              <article
                key={message.id}
                className={`flex ${isProfiledUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${
                    isProfiledUser
                      ? "rounded-br-md bg-[#087f74] text-white"
                      : "rounded-bl-md border border-[#dce8e5] bg-white text-[#203b37]"
                  }`}
                >
                  <p
                    className={`text-[9px] font-bold ${
                      isProfiledUser ? "text-[#a9eee5]" : "text-[#16877d]"
                    }`}
                  >
                    {message.senderId &&
                    message.senderId !== conversation.profiledUser.id ? (
                      <Link
                        href={`/users/${encodeURIComponent(message.senderId)}`}
                        target="_blank"
                        className="underline underline-offset-2"
                      >
                        {message.senderName} · {message.senderId}
                      </Link>
                    ) : (
                      `${message.senderName} · ${message.senderId ?? "Deleted"}`
                    )}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5">
                    {message.body}
                  </p>
                  <p
                    className={`mt-2 text-[8px] ${
                      isProfiledUser ? "text-[#bceee8]" : "text-[#82938f]"
                    }`}
                  >
                    {message.createdAt} · {message.id}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
        <footer className="flex justify-end border-t border-[#e1eae8] bg-white px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#d3e0dd] px-4 py-2.5 text-xs font-bold hover:bg-[#f5f9f8]"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
