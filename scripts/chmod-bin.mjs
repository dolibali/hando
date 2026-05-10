import { chmod } from "node:fs/promises";
import { platform } from "node:os";

if (platform() !== "win32") {
  await chmod("dist/src/main.js", 0o755);
}
