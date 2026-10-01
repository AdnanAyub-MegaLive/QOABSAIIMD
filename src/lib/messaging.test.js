import { describe, expect, it } from "vitest";
import { messageSyncLimit, normalizeGroupMemberIds, normalizeGroupName, serializeMessage } from "./messaging";

describe("messaging contract helpers", () => {
  it("uses a safe bounded page size for offline synchronization", () => {
    expect(messageSyncLimit("1")).toBe(1);
    expect(messageSyncLimit(100)).toBe(100);
    expect(messageSyncLimit("101")).toBe(50);
    expect(messageSyncLimit("0")).toBe(50);
    expect(messageSyncLimit("not-a-number")).toBe(50);
  });

  it("serializes a message using public IDs and ISO timestamps", () => {
    expect(serializeMessage({
      publicId: "MSG-1",
      body: "Hello",
      createdAt: new Date("2026-09-01T12:00:00.000Z"),
      sender: {
        publicId: "TLN-42",
        name: "Host",
        profileImage: null,
        gender: "FEMALE",
        dob: new Date("2000-01-02T00:00:00.000Z"),
        isVerified: true,
        isOfficial: false,
      },
    }, { frameUrl: "https://cdn.example/frame.png", badgeUrl: null, chatBoxUrl: null }))
      .toMatchObject({
        id: "MSG-1",
        senderId: "TLN-42",
        body: "Hello",
        createdAt: "2026-09-01T12:00:00.000Z",
        senderFrameUrl: "https://cdn.example/frame.png",
      });
  });

  it("accepts only bounded group names and unique non-owner members", () => {
    expect(normalizeGroupName("  Mega hosts  ")).toBe("Mega hosts");
    expect(normalizeGroupMemberIds(["USR-1", "USR-2", "USR-2"], "USR-1")).toEqual(["USR-2"]);
    expect(() => normalizeGroupName("x")).toThrow("GROUP_NAME_INVALID");
    expect(() => normalizeGroupMemberIds(["USR-1"], "USR-1")).toThrow("GROUP_MEMBERS_INVALID");
  });
});
