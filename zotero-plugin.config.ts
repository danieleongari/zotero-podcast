import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";

export default defineConfig({
  source: ["src", "addon"],
  dist: ".scaffold/build",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  xpiName: "zotero-podcast",
  updateURL: "https://github.com/danieleongari/zotero-podcast/releases/latest/download/update.json",
  xpiDownloadLink:
    "https://github.com/danieleongari/zotero-podcast/releases/download/v{{version}}/{{xpiName}}.xpi",
  build: {
    assets: ["addon/**/*.*"],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: pkg.homepage,
      buildVersion: pkg.version,
      buildTime: "{{buildTime}}",
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: { __env__: '"production"' },
        bundle: true,
        target: "firefox140",
        outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
      },
      {
        entryPoints: ["src/dialogs/configuration.ts"],
        define: { __env__: '"production"' },
        bundle: true,
        target: "firefox140",
        outfile: ".scaffold/build/addon/content/scripts/configuration.js",
      },
      {
        entryPoints: ["src/dialogs/progress.ts"],
        define: { __env__: '"production"' },
        bundle: true,
        target: "firefox140",
        outfile: ".scaffold/build/addon/content/scripts/progress.js",
      },
    ],
  },
  test: {
    entries: "test-zotero",
    headless: process.env.CI === "true",
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}.data.initialized`,
  },
});
