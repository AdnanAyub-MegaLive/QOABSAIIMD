import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "node",
    // Embedded PostgreSQL and media decoders otherwise contend on 8 GB laptops.
    maxWorkers: 2,
    include: ["src/lib/**/*.test.js"],
    coverage: { reporter: ["text", "html"] },
  },
});
