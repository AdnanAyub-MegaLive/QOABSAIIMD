import { describe, it, expect, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { MOV_MIME, isMovFile, looksLikeMov, mp4FileName, movConversionArgs, convertMovToMp4 } from "./mov-convert.js";
import { validateUploadAssetContract } from "./upload-assets.js";

const mov = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from("ftypqt  "), Buffer.alloc(20)]);

describe("mov conversion", () => {
  it("accepts video/quicktime and .mov names", () => {
    expect(isMovFile({ type: MOV_MIME, name: "a.bin" })).toBe(true);
    expect(isMovFile({ type: "", name: "Clip.MOV" })).toBe(true);
    expect(isMovFile({ type: "video/mp4", name: "a.mp4" })).toBe(false);
    expect(mp4FileName("Clip.MOV")).toBe("Clip.mp4");
    expect(() => validateUploadAssetContract({ category: "GIFTS", mimeType: "video/mp4" })).not.toThrow();
  });

  it("rejects non-video .mov bytes", async () => {
    expect(looksLikeMov(Buffer.from("hello world, not a movie"))).toBe(false);
    await expect(convertMovToMp4(Buffer.from("hello world, not a movie"), { available: async () => true, exec: vi.fn() })).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE", status: 415 });
  });

  it("reports missing ffmpeg clearly", async () => {
    const exec = vi.fn();
    await expect(convertMovToMp4(mov, { available: async () => false, exec })).rejects.toMatchObject({ code: "FFMPEG_UNAVAILABLE", message: expect.stringContaining("MOV needs ffmpeg on the server") });
    expect(exec).not.toHaveBeenCalled();
  });

  it("invokes ffmpeg with H.264/AAC faststart args and returns the mp4", async () => {
    const exec = vi.fn(async (_bin, args) => { await writeFile(args.at(-1), Buffer.from("mp4data")); expect(readFileSync(args[args.indexOf("-i") + 1])).toEqual(mov); });
    const out = await convertMovToMp4(mov, { available: async () => true, exec });
    expect(out.toString()).toBe("mp4data");
    const args = exec.mock.calls[0][1];
    expect(args.join(" ")).toContain("-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac");
    expect(args).toContain("+faststart");
    expect(args).toContain("0:a:0?");
    expect(args).toEqual(movConversionArgs(args[args.indexOf("-i") + 1], args.at(-1)));
  });

  it("maps ffmpeg failure to a clear rejection", async () => {
    await expect(convertMovToMp4(mov, { available: async () => true, exec: vi.fn().mockRejectedValue(new Error("x")) })).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
  });
});
