import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const requiredFiles = ["index.html", "styles.css", "app.js"];
const requiredDirs = ["assets"];

async function assertExists(path) {
  await stat(join(root, path));
}

await Promise.all([...requiredFiles, ...requiredDirs].map(assertExists));

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of requiredFiles) {
  await cp(join(root, file), join(dist, file));
}

for (const dir of requiredDirs) {
  await cp(join(root, dir), join(dist, dir), { recursive: true });
}

await writeFile(join(dist, "_redirects"), "/* /index.html 200\n", "utf8");

console.log("Design Race Lab listo en dist/");
