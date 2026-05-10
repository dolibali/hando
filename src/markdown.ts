import type { TaskMeta } from "./types.js";

export interface ParsedTaskMarkdown {
  readonly meta: TaskMeta;
  readonly body: string;
}

export function parseTaskMarkdown(markdown: string): ParsedTaskMarkdown {
  if (!markdown.startsWith("---\n")) {
    throw new Error("task.md is missing frontmatter");
  }
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) {
    throw new Error("task.md has unterminated frontmatter");
  }
  const frontmatter = markdown.slice(4, end);
  const body = markdown.slice(end + "\n---\n".length).trimStart();
  return {
    meta: parseFrontmatter(frontmatter),
    body,
  };
}

export function renderTaskMarkdown(meta: TaskMeta, body: string): string {
  return `---\n${renderFrontmatter(meta)}---\n\n${body.trim()}\n`;
}

function parseFrontmatter(frontmatter: string): TaskMeta {
  const scalarValues = new Map<string, string>();
  const tags: string[] = [];
  let currentList: string | undefined;

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) {
      continue;
    }
    const listMatch = line.match(/^\s+-\s*(.*)$/);
    if (listMatch && currentList === "tags") {
      tags.push(unquote(listMatch[1] ?? ""));
      continue;
    }
    const pairMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!pairMatch) {
      continue;
    }
    const [, key, value] = pairMatch;
    currentList = value === "" ? key : undefined;
    if (key !== undefined && value !== undefined && value !== "") {
      scalarValues.set(key, unquote(value));
    }
  }

  const id = requiredScalar(scalarValues, "id");
  const title = requiredScalar(scalarValues, "title");
  const cwd = requiredScalar(scalarValues, "cwd");
  const branch = requiredScalar(scalarValues, "branch");
  const createdAt = requiredScalar(scalarValues, "created_at");
  const updatedAt = requiredScalar(scalarValues, "updated_at");

  return {
    id,
    title,
    project: optionalScalar(scalarValues, "project"),
    cwd,
    gitRemote: optionalScalar(scalarValues, "git_remote"),
    branch,
    createdAt,
    updatedAt,
    tags,
  };
}

function renderFrontmatter(meta: TaskMeta): string {
  const lines = [
    `id: ${escapeYamlScalar(meta.id)}`,
    `title: ${escapeYamlScalar(meta.title)}`,
  ];
  pushOptional(lines, "project", meta.project);
  lines.push(`cwd: ${escapeYamlScalar(meta.cwd)}`);
  pushOptional(lines, "git_remote", meta.gitRemote);
  lines.push(`branch: ${escapeYamlScalar(meta.branch)}`);
  lines.push(`created_at: ${escapeYamlScalar(meta.createdAt)}`);
  lines.push(`updated_at: ${escapeYamlScalar(meta.updatedAt)}`);
  lines.push("tags:");
  for (const tag of meta.tags) {
    lines.push(`  - ${escapeYamlScalar(tag)}`);
  }
  return `${lines.join("\n")}\n`;
}

function pushOptional(lines: string[], key: string, value: string | undefined): void {
  if (value !== undefined && value.trim() !== "") {
    lines.push(`${key}: ${escapeYamlScalar(value)}`);
  }
}

function requiredScalar(values: Map<string, string>, key: string): string {
  const value = values.get(key);
  if (value === undefined || value.trim() === "") {
    throw new Error(`task.md frontmatter missing required field: ${key}`);
  }
  return value;
}

function optionalScalar(values: Map<string, string>, key: string): string | undefined {
  const value = values.get(key);
  return value === undefined || value.trim() === "" ? undefined : value;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return parseJsonQuotedScalar(trimmed);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseJsonQuotedScalar(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value.slice(1, -1);
  } catch {
    return value.slice(1, -1);
  }
}

function escapeYamlScalar(value: string): string {
  if (/^[A-Za-z0-9._/@:+-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}
