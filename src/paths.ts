import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface HandoPaths {
  readonly home: string;
  readonly configFile: string;
  readonly tasksDir: string;
  readonly archiveDir: string;
}

export function getHandoPaths(home = process.env.HANDO_HOME): HandoPaths {
  const root = resolve(home ?? join(homedir(), ".hando"));
  return {
    home: root,
    configFile: join(root, "config.yaml"),
    tasksDir: join(root, "tasks"),
    archiveDir: join(root, "archive"),
  };
}

export async function ensureHandoDirectories(paths = getHandoPaths()): Promise<HandoPaths> {
  await mkdir(paths.tasksDir, { recursive: true });
  await mkdir(paths.archiveDir, { recursive: true });
  return paths;
}
