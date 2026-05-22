// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
var alias = {
  "@movscript/draft-schemas": resolve("../../packages/draft-schemas/src/index.ts"),
  "@movscript/tokens/theme.css": resolve("../../packages/tokens/src/theme.css"),
  "@movscript/ui/styles.css": resolve("../../packages/ui/src/styles.css"),
  "@movscript/tokens": resolve("../../packages/tokens/src/index.ts"),
  "@movscript/ui": resolve("../../packages/ui/src/index.ts"),
  "@runtime": process.env.MOVSCRIPT_FRONTEND_RUNTIME_ENTRY ? resolve(process.env.MOVSCRIPT_FRONTEND_RUNTIME_ENTRY) : resolve("src/runtime/community.tsx"),
  "@": resolve("src")
};
var rendererPort = Number(process.env.MOVSCRIPT_FRONTEND_PORT ?? "5173");
var disableRendererHmr = process.env.MOVSCRIPT_FRONTEND_NO_HMR === "1";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("electron/main.ts") }
      }
    },
    resolve: {
      alias
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("electron/preload.ts") }
      }
    }
  },
  renderer: {
    plugins: [react()],
    root: ".",
    server: {
      host: "127.0.0.1",
      port: rendererPort,
      strictPort: true,
      hmr: disableRendererHmr ? false : void 0
    },
    optimizeDeps: {
      force: true
    },
    build: {
      rollupOptions: {
        input: resolve("index.html")
      }
    },
    resolve: {
      alias
    }
  }
});
export {
  electron_vite_config_default as default
};
