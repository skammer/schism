import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";

const isDatastarBuild = process.env.BUILD_TARGET === "datastar";

export default defineConfig({
  build: {
    emptyOutDir: !isDatastarBuild,
    lib: isDatastarBuild
      ? {
          entry: resolve(__dirname, "src/datastar.ts"),
          formats: ["es"],
          fileName: () => "datastar.js",
        }
      : {
          entry: resolve(__dirname, "src/index.ts"),
          formats: ["es"],
          fileName: () => "schism.js",
        },
    rollupOptions: isDatastarBuild
      ? {
          external: [/\.\/index\.js$/, /\.\/index$/],
          output: {
            inlineDynamicImports: true,
            paths: { "./index.js": "./schism.js", "./index": "./schism.js" },
          },
        }
      : {
          output: { inlineDynamicImports: true },
        },
    sourcemap: true,
    target: "es2022",
    minify: false,
  },
  plugins: [dts({ rollupTypes: true, include: ["src"], outDir: "dist" })],
  server: {
    open: "/demos/wc-only.html",
  },
});
