import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "node",
    // Existing financial fixtures model pre-cutover UTC history. Dedicated
    // business-time tests override this to exercise UTC+7 and the transition.
    env: { NEXT_PUBLIC_BUSINESS_TIMEZONE_CUTOVER_AT: '2030-01-01T00:00:00.000Z' },
    // Embedded PostgreSQL and media decoders otherwise contend on 8 GB laptops.
    maxWorkers: 2,
    include: ["src/lib/**/*.test.js"],
    coverage: { reporter: ["text", "html"] },
  },
});
