import { describe, expect, it } from "vitest";
import {
  ALLOWED_EVENT_EXTENSIONS,
  normalizeEventPath,
} from "../storage.js";

describe("Events storage path validation", () => {
  it("normalizes Windows folder paths", () => {
    expect(normalizeEventPath("SummerSale\\images\\banner.png")).toBe(
      "SummerSale/images/banner.png",
    );
  });

  it.each(["../secret.txt", "assets/../../secret.txt", "./index.html"])(
    "rejects traversal path %s",
    (candidate) => {
      expect(() => normalizeEventPath(candidate)).toThrow();
    },
  );

  it("allows the documented event asset extensions", () => {
    for (const extension of [
      ".html", ".css", ".js", ".json", ".png", ".jpg", ".jpeg",
      ".webp", ".gif", ".svg", ".mp4", ".webm", ".mp3", ".woff",
      ".woff2", ".ttf", ".otf",
    ])
      expect(ALLOWED_EVENT_EXTENSIONS.has(extension)).toBe(true);
  });

  it.each([".exe", ".php", ".dll", ".sh", ".py", ".jar", ".aspx"])(
    "does not allow executable extension %s",
    (extension) => expect(ALLOWED_EVENT_EXTENSIONS.has(extension)).toBe(false),
  );
});
