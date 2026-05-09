import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

async function runCli(args: readonly string[], home: string) {
  return execFileAsync("node", ["--import", "tsx", "src/main.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, HANDO_HOME: home },
  });
}

describe("hando CLI", () => {
  it("saves, lists, resumes, archives, and restores a task", async () => {
    const home = await mkdtemp(join(tmpdir(), "hando-cli-"));

    await runCli(["setup"], home);
    const save = await runCli(
      ["save", "CLI handoff task", "--summary", "Background, progress, next steps."],
      home,
    );
    expect(save.stdout).toContain("cli-handoff-task");

    const list = await runCli(["ls"], home);
    expect(list.stdout).toContain("CLI handoff task");

    const resume = await runCli(["resume", "handoff"], home);
    expect(resume.stdout).toContain("Background, progress");

    await runCli(["done", "cli-handoff-task"], home);
    const active = await runCli(["ls"], home);
    expect(active.stdout).toContain("No handoff tasks found");

    const archived = await runCli(["ls", "--archive"], home);
    expect(archived.stdout).toContain("CLI handoff task");

    await runCli(["restore", "cli-handoff-task"], home);
    const restored = await runCli(["ls"], home);
    expect(restored.stdout).toContain("CLI handoff task");
  });
});
