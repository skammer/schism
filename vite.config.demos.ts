import { defineConfig } from "vite";
import { resolve } from "node:path";

const root = resolve(__dirname, "demos");

export default defineConfig({
  root,
  base: "./",
  build: {
    outDir: resolve(__dirname, "dist-demos"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        datastar: resolve(root, "datastar.html"),
      },
    },
  },
});
