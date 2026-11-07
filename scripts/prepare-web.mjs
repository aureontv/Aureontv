import { cp, mkdir, rm } from "node:fs/promises";
await rm("www", { recursive: true, force: true });
await mkdir("www", { recursive: true });
for (const file of ["index.html", "app.js", "styles.css"]) await cp(file, "www/" + file);
