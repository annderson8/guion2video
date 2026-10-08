import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["paquetes/*/src/**/*.test.ts", "pruebas/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: { GUION2VIDEO_SIMULAR: "1" },
  },
});
