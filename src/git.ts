import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChangedFile, ChangedFileStatus, GitSnapshot } from "./types.js";

const execFileAsync = promisify(execFile);

export async function collectGitSnapshot(cwd: string): Promise<GitSnapshot> {
  const capturedAt = new Date().toISOString();
  try {
    await git(["rev-parse", "--is-inside-work-tree"], cwd);
  } catch {
    return {
      available: false,
      cwd,
      reason: "not_a_git_repository",
      capturedAt,
    };
  }

  const [branch, remote, status] = await Promise.all([
    currentBranch(cwd),
    git(["config", "--get", "remote.origin.url"], cwd).catch(() => ""),
    git(["status", "--porcelain=v1"], cwd).catch(() => ""),
  ]);
  const changedFiles = parsePorcelainStatus(status);
  return {
    available: true,
    cwd,
    branch: branch || undefined,
    gitRemote: remote.trim() || undefined,
    hasUncommittedChanges: changedFiles.length > 0,
    changedFiles,
    capturedAt,
  };
}

export function renderCodeStatus(snapshot: GitSnapshot): string {
  if (!snapshot.available) {
    return [
      "## 当前代码状态",
      "",
      `- 工作目录：${snapshot.cwd}`,
      "- 当前分支：not_a_git_repository",
      "- Git 状态：不可用",
      `- 原因：${snapshot.reason ?? "unknown"}`,
      `- 采集时间：${snapshot.capturedAt}`,
    ].join("\n");
  }

  const files = snapshot.changedFiles ?? [];
  const fileLines =
    files.length === 0
      ? ["- 相关文件：无未提交变更"]
      : [
          "- 相关文件：",
          ...files.map((file) => {
            const staged = file.staged ? "已暂存" : "未暂存";
            return `  - ${file.path}：${file.status}，${staged}`;
          }),
        ];

  return [
    "## 当前代码状态",
    "",
    `- 工作目录：${snapshot.cwd}`,
    `- 当前分支：${snapshot.branch ?? "unknown"}`,
    `- Git remote：${snapshot.gitRemote ?? "unknown"}`,
    `- 是否有未提交修改：${snapshot.hasUncommittedChanges ? "是" : "否"}`,
    ...fileLines,
    `- 采集时间：${snapshot.capturedAt}`,
    "- 接手后请重新运行 `git status` 或等价命令确认实时状态。",
  ].join("\n");
}

async function git(args: readonly string[], cwd: string): Promise<string> {
  const result = await execFileAsync("git", [...args], { cwd });
  return result.stdout;
}

async function currentBranch(cwd: string): Promise<string> {
  const branch = (await git(["branch", "--show-current"], cwd).catch(() => "")).trim();
  if (branch !== "") {
    return branch;
  }
  const ref = (await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd).catch(() => "")).trim();
  return ref === "" ? "unknown" : ref;
}

function parsePorcelainStatus(output: string): ChangedFile[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map(parsePorcelainLine);
}

function parsePorcelainLine(line: string): ChangedFile {
  const x = line[0] ?? " ";
  const y = line[1] ?? " ";
  const rawPath = line.slice(3);
  const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1) ?? rawPath : rawPath;
  return {
    path,
    status: mapGitStatus(x === " " ? y : x),
    staged: x !== " " && x !== "?",
  };
}

function mapGitStatus(status: string): ChangedFileStatus {
  switch (status) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "?":
      return "untracked";
    default:
      return "unknown";
  }
}
