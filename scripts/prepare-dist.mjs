import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");

await mkdir(distDir, { recursive: true });
await cp(path.join(rootDir, "public"), path.join(distDir, "public"), { recursive: true, force: true });
await cp(path.join(rootDir, "db"), path.join(distDir, "db"), { recursive: true, force: true });
