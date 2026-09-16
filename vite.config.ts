import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react()],
  build:
    mode === "standalone"
      ? {
          rollupOptions: {
            output: {
              inlineDynamicImports: true
            }
          }
        }
      : undefined,
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
}));
