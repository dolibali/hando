import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { collectGitSnapshot, renderCodeStatus } from "./git.js";
import { parseTaskMarkdown, renderTaskMarkdown } from "./markdown.js";
import { ensureHandoDirectories, getHandoPaths, type HandoPaths } from "./paths.js";
import type {
  Candidate,
  ListInput,
  ResumeInput,
  ResumeResult,
  SaveInput,
  SetArchiveInput,
  TaskLocation,
  TaskMeta,
  TaskRecord,
} from "./types.js";
import { HandoError } from "./types.js";

export class HandoService {
  constructor(private readonly paths: HandoPaths = getHandoPaths()) {}

  async setup(): Promise<HandoPaths> {
    await ensureHandoDirectories(this.paths);
    try {
      await readFile(this.paths.configFile, "utf8");
    } catch {
      await writeFile(
        this.paths.configFile,
        `home: ${this.paths.home}\ncreated_at: ${new Date().toISOString()}\n`,
        "utf8",
      );
    }
    return this.paths;
  }

  async doctor(): Promise<readonly string[]> {
    const paths = await this.setup();
    return [
      `home: ${paths.home}`,
      `config: ${paths.configFile}`,
      `tasks: ${paths.tasksDir}`,
      `archive: ${paths.archiveDir}`,
    ];
  }

  async save(input: SaveInput): Promise<TaskRecord> {
    const title = input.title.trim();
    if (title === "") {
      throw new HandoError("validation_failed", "title is required for save", "title");
    }
    await this.setup();
    const cwd = input.cwd ?? process.cwd();
    const snapshot = await collectGitSnapshot(cwd);
    const existing = input.id
      ? await this.get(input.id)
      : await this.findAutoUpdateCandidate(title, input.summary, snapshot.gitRemote, cwd);

    if (existing === undefined && (input.summary ?? "").trim() === "") {
      throw new HandoError(
        "validation_failed",
        "summary is required when creating a new task",
        "summary",
      );
    }

    const now = new Date().toISOString();
    const id = existing?.meta.id ?? (await this.createUniqueTaskId(title));
    const createdAt = existing?.meta.createdAt ?? now;
    const tags = input.tags ?? existing?.meta.tags ?? [];
    const meta: TaskMeta = {
      id,
      title,
      project: input.project ?? existing?.meta.project ?? inferProject(snapshot.gitRemote, cwd),
      cwd,
      gitRemote: snapshot.gitRemote ?? existing?.meta.gitRemote,
      branch: snapshot.branch ?? existing?.meta.branch,
      sourceAgent: input.agent ?? existing?.meta.sourceAgent,
      createdAt,
      updatedAt: now,
      tags,
    };
    const body = renderTaskBody({
      title,
      summary: input.summary,
      existingBody: existing?.body,
      codeStatus: renderCodeStatus(snapshot),
    });
    const taskDir = join(this.paths.tasksDir, id);
    await mkdir(taskDir, { recursive: true });
    const filePath = join(taskDir, "task.md");
    await writeFile(filePath, renderTaskMarkdown(meta, body), "utf8");
    return { meta, body, location: "active", filePath };
  }

  async list(input: ListInput = {}): Promise<readonly TaskRecord[]> {
    await this.setup();
    const location: TaskLocation = input.archive === true ? "archive" : "active";
    const records = await this.readTasks(location);
    return records
      .filter((record) => (input.project ? record.meta.project === input.project : true))
      .map((record) => ({ record, score: input.query ? scoreRecord(record, input.query) : 1 }))
      .filter(({ score }) => (input.query ? score > 0 : true))
      .sort((a, b) => b.score - a.score || compareUpdatedAt(b.record, a.record))
      .map(({ record }) => record);
  }

  async get(id: string, archive = false): Promise<TaskRecord> {
    await this.setup();
    const location: TaskLocation = archive ? "archive" : "active";
    const found = await this.readTask(id, location);
    if (found !== undefined) {
      return found;
    }
    if (!archive) {
      const archived = await this.readTask(id, "archive");
      if (archived !== undefined) {
        throw new HandoError("task_archived", `task '${id}' is archived`, "id");
      }
    }
    throw new HandoError("not_found", `task '${id}' was not found`, "id");
  }

  async resume(input: ResumeInput = {}): Promise<ResumeResult> {
    await this.setup();
    if (input.id !== undefined && input.id.trim() !== "") {
      return { kind: "match", task: await this.get(input.id, input.includeArchive === true) };
    }
    const active = await this.readTasks("active");
    const archived = input.includeArchive === true ? await this.readTasks("archive") : [];
    const records = [...active, ...archived].filter((record) =>
      input.project ? record.meta.project === input.project : true,
    );
    const query = input.query?.trim();
    const scored = records
      .map((record) => ({ record, score: query ? scoreRecord(record, query) : 1 }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || compareUpdatedAt(b.record, a.record));

    if (scored.length === 0) {
      return {
        kind: "empty",
        message: "No matching handoff task found. Try a different query or create one with save.",
      };
    }
    const [first, second] = scored;
    if (first === undefined) {
      return { kind: "empty", message: "No matching handoff task found." };
    }
    if (second !== undefined && second.score >= first.score - 1) {
      return {
        kind: "candidates",
        candidates: scored.slice(0, 5).map(({ record, score }) => candidateFromRecord(record, score)),
        message: "Multiple possible handoff tasks matched. Choose one by id.",
      };
    }
    return { kind: "match", task: first.record };
  }

  async archive(input: SetArchiveInput): Promise<TaskRecord> {
    await this.setup();
    return this.moveTask(input.id, "active", "archive");
  }

  async restore(input: SetArchiveInput): Promise<TaskRecord> {
    await this.setup();
    return this.moveTask(input.id, "archive", "active");
  }

  private async findAutoUpdateCandidate(
    title: string,
    summary: string | undefined,
    gitRemote: string | undefined,
    cwd: string,
  ): Promise<TaskRecord | undefined> {
    const active = await this.readTasks("active");
    const candidates = active
      .filter((record) => record.meta.gitRemote === gitRemote || record.meta.cwd === cwd)
      .map((record) => ({
        record,
        score: titleSimilarity(record.meta.title, title) + (summary ? textScore(record.body, summary) : 0),
      }))
      .filter(({ score }) => score >= 3)
      .sort((a, b) => b.score - a.score || compareUpdatedAt(b.record, a.record));
    const [first, second] = candidates;
    if (first === undefined) {
      return undefined;
    }
    if (second !== undefined && second.score === first.score) {
      throw new HandoError(
        "ambiguous_candidates",
        "multiple existing tasks may match; pass an id to update one explicitly",
        "id",
        candidates.slice(0, 5).map(({ record, score }) => candidateFromRecord(record, score)),
      );
    }
    return first.record;
  }

  private async createUniqueTaskId(title: string): Promise<string> {
    const base = slugify(title);
    for (let index = 0; index < 100; index += 1) {
      const id = index === 0 ? base : `${base}-${index + 1}`;
      const active = await this.readTask(id, "active");
      const archived = await this.readTask(id, "archive");
      if (active === undefined && archived === undefined) {
        return id;
      }
    }
    return `${base}-${Date.now()}`;
  }

  private async moveTask(id: string, from: TaskLocation, to: TaskLocation): Promise<TaskRecord> {
    const sourceRoot = from === "active" ? this.paths.tasksDir : this.paths.archiveDir;
    const targetRoot = to === "active" ? this.paths.tasksDir : this.paths.archiveDir;
    const source = join(sourceRoot, id);
    const target = join(targetRoot, id);
    const existingTarget = await this.readTask(id, to);
    if (existingTarget !== undefined) {
      throw new HandoError("target_exists", `task '${id}' already exists in ${to}`, "id");
    }
    await rename(source, target).catch((error: unknown) => {
      throw new HandoError("not_found", `task '${id}' was not found in ${from}`, "id", error);
    });
    const moved = await this.readTask(id, to);
    if (moved === undefined) {
      throw new HandoError("move_failed", `task '${id}' could not be read after move`, "id");
    }
    return moved;
  }

  private async readTasks(location: TaskLocation): Promise<readonly TaskRecord[]> {
    const root = location === "active" ? this.paths.tasksDir : this.paths.archiveDir;
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.readTask(entry.name, location)),
    );
    return records.filter((record): record is TaskRecord => record !== undefined);
  }

  private async readTask(id: string, location: TaskLocation): Promise<TaskRecord | undefined> {
    const root = location === "active" ? this.paths.tasksDir : this.paths.archiveDir;
    const filePath = join(root, id, "task.md");
    try {
      const markdown = await readFile(filePath, "utf8");
      const parsed = parseTaskMarkdown(markdown);
      return { meta: parsed.meta, body: parsed.body, location, filePath };
    } catch {
      return undefined;
    }
  }
}

function renderTaskBody(input: {
  readonly title: string;
  readonly summary?: string;
  readonly existingBody?: string;
  readonly codeStatus: string;
}): string {
  const summary = input.summary?.trim();
  if (summary === undefined || summary === "") {
    return replaceCodeStatus(input.existingBody ?? `# ${input.title}\n`, input.codeStatus);
  }
  const body =
    summary.includes("## ") || summary.startsWith("# ")
      ? `# ${input.title}\n\n${summary.replace(/^# .*\n+/, "")}`
      : [
          `# ${input.title}`,
          "",
          "## 任务交接说明",
          "",
          summary,
          "",
          "## 给下一个 Agent 的指令",
          "",
          "请根据任务交接说明和当前代码状态继续推进任务。",
        ].join("\n");
  return replaceCodeStatus(body, input.codeStatus);
}

function replaceCodeStatus(body: string, codeStatus: string): string {
  const sectionPattern = /\n## 当前代码状态\n[\s\S]*?(?=\n## |\s*$)/;
  if (sectionPattern.test(body)) {
    return body.replace(sectionPattern, `\n${codeStatus}\n`);
  }
  return `${body.trim()}\n\n${codeStatus}`;
}

function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug === "" ? `task-${Date.now()}` : slug;
}

function inferProject(gitRemote: string | undefined, cwd: string): string | undefined {
  if (gitRemote !== undefined && gitRemote.trim() !== "") {
    const repo = gitRemote.replace(/\.git$/, "").split(/[/:]/).at(-1);
    return repo === undefined || repo === "" ? undefined : repo;
  }
  return basename(cwd);
}

function scoreRecord(record: TaskRecord, query: string): number {
  const q = query.toLowerCase();
  return (
    exactScore(record.meta.id, q, 100) +
    textScore(record.meta.title, q) * 5 +
    textScore(record.meta.tags.join(" "), q) * 4 +
    textScore(record.meta.project ?? "", q) * 4 +
    textScore(record.meta.cwd ?? "", q) * 2 +
    textScore(record.meta.gitRemote ?? "", q) * 2 +
    textScore(record.body, q)
  );
}

function exactScore(value: string, query: string, score: number): number {
  return value.toLowerCase() === query ? score : 0;
}

function titleSimilarity(a: string, b: string): number {
  return textScore(a, b) * 5;
}

function textScore(text: string, query: string): number {
  const haystack = text.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/[\s,，。:：/\\_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return 0;
  }
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function compareUpdatedAt(a: TaskRecord, b: TaskRecord): number {
  return new Date(a.meta.updatedAt).getTime() - new Date(b.meta.updatedAt).getTime();
}

function candidateFromRecord(record: TaskRecord, score: number): Candidate {
  return {
    id: record.meta.id,
    title: record.meta.title,
    project: record.meta.project,
    updatedAt: record.meta.updatedAt,
    location: record.location,
    score,
  };
}
