import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTaskMarkdown, renderTaskMarkdown } from "../src/markdown.js";
import { getHandoPaths } from "../src/paths.js";
import { HandoService } from "../src/storage.js";

async function createService() {
  const home = await mkdtemp(join(tmpdir(), "hando-test-"));
  return {
    home,
    service: new HandoService(getHandoPaths(home)),
  };
}

describe("HandoService", () => {
  it("creates a markdown-only task and resumes it by query", async () => {
    const { home, service } = await createService();
    const saved = await service.save({
      title: "Implement setup token handoff",
      summary: "Task background, current progress, next steps, and risks.",
      cwd: home,
    });

    expect(saved.meta.id).toBe("implement-setup-token-handoff");
    expect(saved.meta.cwd).toBe(home);
    expect(saved.meta.branch).toBe("not_a_git_repository");
    const taskPath = join(home, "tasks", saved.meta.id, "task.md");
    await expect(stat(taskPath)).resolves.toBeTruthy();
    await expect(stat(join(home, "tasks", saved.meta.id, "git.json"))).rejects.toThrow();

    const markdown = await readFile(taskPath, "utf8");
    expect(markdown).toContain(`cwd: ${home}`);
    expect(markdown).toContain("branch: not_a_git_repository");
    expect(markdown).toContain("## 任务交接说明");
    expect(markdown).toContain("## 当前代码状态");
    expect(markdown).toContain("Git 状态：不可用");

    const resumed = await service.resume({ query: "setup token" });
    expect(resumed.kind).toBe("match");
    if (resumed.kind === "match") {
      expect(resumed.task.meta.id).toBe(saved.meta.id);
      expect(resumed.task.body).toContain("Task background");
    }
  });

  it("requires summary when creating a new task", async () => {
    const { home, service } = await createService();
    await expect(
      service.save({
        title: "Empty shell task",
        cwd: home,
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      field: "summary",
    });
  });

  it("archives and restores a task by moving its directory", async () => {
    const { home, service } = await createService();
    const saved = await service.save({
      title: "Archive me",
      summary: "Enough context to create the task.",
      cwd: home,
    });

    await service.archive({ id: saved.meta.id });
    await expect(stat(join(home, "archive", saved.meta.id, "task.md"))).resolves.toBeTruthy();
    expect(await service.list()).toHaveLength(0);

    await service.restore({ id: saved.meta.id });
    await expect(stat(join(home, "tasks", saved.meta.id, "task.md"))).resolves.toBeTruthy();
    expect(await service.list()).toHaveLength(1);
  });

  it("updates a clearly matching task instead of creating a duplicate", async () => {
    const { home, service } = await createService();
    const first = await service.save({
      title: "Improve resume lookup",
      summary: "Initial handoff.",
      cwd: home,
    });
    const second = await service.save({
      title: "Improve resume lookup",
      summary: "Updated handoff.",
      cwd: home,
    });

    expect(second.meta.id).toBe(first.meta.id);
    expect(await service.list()).toHaveLength(1);
    expect((await service.get(first.meta.id)).body).toContain("Updated handoff");
  });

  it("round-trips Windows working directories in task frontmatter", () => {
    const markdown = renderTaskMarkdown(
      {
        id: "windows-path-task",
        title: "Windows path task",
        project: "hando",
        cwd: "C:\\Users\\me\\work\\hando",
        gitRemote: "https://github.com/dolibali/hando.git",
        branch: "feature/windows-path",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
        tags: ["windows"],
      },
      "# Windows path task",
    );

    const parsed = parseTaskMarkdown(markdown);

    expect(markdown).toContain('cwd: "C:\\\\Users\\\\me\\\\work\\\\hando"');
    expect(parsed.meta.cwd).toBe("C:\\Users\\me\\work\\hando");
    expect(parsed.meta.branch).toBe("feature/windows-path");
  });
});
