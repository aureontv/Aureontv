import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("www", { recursive: true, force: true });
await mkdir("www", { recursive: true });

// Keep the installed Android wrapper aligned with the hosted AUREON TV interface.
for (const file of ["index.html", "styles.css", "manifest.webmanifest", "service-worker.js"]) {
  await cp(file, "www/" + file);
}
await cp("icons", "www/icons", { recursive: true });

await build({
  entryPoints: ["native-entry.js"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["es2020"],
  outfile: "www/app.js",
});
