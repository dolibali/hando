import { HandoError, type ResumeResult, type TaskRecord } from "./types.js";

export function formatTaskList(records: readonly TaskRecord[]): string {
  if (records.length === 0) {
    return "No handoff tasks found.";
  }
  return records
    .map((record) => {
      const project = record.meta.project ? ` [${record.meta.project}]` : "";
      return `${record.meta.id}${project} - ${record.meta.title} (${record.meta.updatedAt})`;
    })
    .join("\n");
}

export function formatTask(record: TaskRecord): string {
  return record.body;
}

export function formatResumeResult(result: ResumeResult): string {
  switch (result.kind) {
    case "match":
      if (result.task === undefined) {
        return "No task returned.";
      }
      return result.task.body;
    case "candidates":
      return [
        result.message ?? "Multiple matching handoff tasks found.",
        "",
        ...(result.candidates ?? []).map(
          (candidate) =>
            `${candidate.id} [${candidate.location}] - ${candidate.title} (${candidate.updatedAt})`,
        ),
      ].join("\n");
    case "empty":
      return result.message ?? "No matching handoff task found.";
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatError(error: unknown): string {
  if (error instanceof HandoError) {
    return JSON.stringify(
      {
        error: error.code,
        field: error.field,
        message: error.message,
        details: error.details,
      },
      null,
      2,
    );
  }
  if (error instanceof Error) {
    return JSON.stringify({ error: "internal_error", message: error.message }, null, 2);
  }
  return JSON.stringify({ error: "unknown_error", message: String(error) }, null, 2);
}
