import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";
await rm("www", { recursive: true, force: true });
await mkdir("www", { recursive: true });
for (const file of ["index.html", "styles.css"]) await cp(file, "www/" + file);
await build({
  entryPoints: ["app.js"],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["es2020"],
  outfile: "www/app.js",
});
