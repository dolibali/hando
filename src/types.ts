export type TaskLocation = "active" | "archive";

export type ChangedFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "unknown";

export interface ChangedFile {
  readonly path: string;
  readonly status: ChangedFileStatus;
  readonly staged: boolean;
}

export interface GitSnapshot {
  readonly available: boolean;
  readonly cwd: string;
  readonly branch?: string;
  readonly gitRemote?: string;
  readonly hasUncommittedChanges?: boolean;
  readonly changedFiles?: readonly ChangedFile[];
  readonly reason?: string;
  readonly capturedAt: string;
}

export interface TaskMeta {
  readonly id: string;
  readonly title: string;
  readonly project?: string;
  readonly cwd?: string;
  readonly gitRemote?: string;
  readonly branch?: string;
  readonly sourceAgent?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags: readonly string[];
}

export interface TaskRecord {
  readonly meta: TaskMeta;
  readonly body: string;
  readonly location: TaskLocation;
  readonly filePath: string;
}

export interface SaveInput {
  readonly title: string;
  readonly summary?: string;
  readonly id?: string;
  readonly project?: string;
  readonly tags?: readonly string[];
  readonly agent?: string;
  readonly cwd?: string;
}

export interface ResumeInput {
  readonly query?: string;
  readonly id?: string;
  readonly project?: string;
  readonly includeArchive?: boolean;
}

export interface ListInput {
  readonly query?: string;
  readonly project?: string;
  readonly archive?: boolean;
}

export interface SetArchiveInput {
  readonly id: string;
}

export interface Candidate {
  readonly id: string;
  readonly title: string;
  readonly project?: string;
  readonly updatedAt: string;
  readonly location: TaskLocation;
  readonly score: number;
}

export type ResumeResult =
  | {
      readonly kind: "match";
      readonly task: TaskRecord;
    }
  | {
      readonly kind: "candidates";
      readonly candidates: readonly Candidate[];
      readonly message: string;
    }
  | {
      readonly kind: "empty";
      readonly message: string;
    };

export class HandoError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HandoError";
  }
}
