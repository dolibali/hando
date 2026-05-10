import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { formatJson } from "./format.js";
import { HandoService } from "./storage.js";
import { HandoError } from "./types.js";

export async function serveMcp(service = new HandoService()): Promise<void> {
  const server = createMcpServer(service);
  await server.connect(new StdioServerTransport());
}

export function createMcpServer(service = new HandoService()): McpServer {
  const server = new McpServer({
    name: "hando",
    version: "0.0.1",
  });

  server.registerTool(
    "save",
    {
      title: "Save handoff task",
      description:
        "Save or update a Hando handoff packet. Use only when the user asks to save progress, hand off work to another AI agent, or the current agent may stop soon. Agent writes the task context in summary; Hando stores and retrieves it. Do not edit Hando storage files directly.",
      inputSchema: {
        title: z
          .string()
          .min(1)
          .describe("Real task name, such as 'Implement setup token handoff'; not a reason like 'quota is low'."),
        summary: z
          .string()
          .optional()
          .describe(
            "Agent-written handoff content. Required when creating a new task; optional when updating an existing id. Include background, goal, progress, next steps, risks, validation, and instructions.",
          ),
        id: z
          .string()
          .optional()
          .describe("Existing task id to update. Omit to let Hando create or match an active task."),
        project: z.string().optional().describe("Optional project name used for filtering and display."),
        tags: z.array(z.string()).optional().describe("Optional tags that help future resume searches."),
      },
      outputSchema: taskRecordOutputSchema,
      annotations: writeAnnotations,
    },
    async (input) => safeToolCall(() => service.save(input)),
  );

  server.registerTool(
    "resume",
    {
      title: "Resume handoff task",
      description:
        "Find and return a saved Hando handoff packet for a coding task. Use when the user asks to continue previous work. Returned content is task context, not the final answer; read it, inspect the cwd/repo, then continue.",
      inputSchema: {
        query: z.string().optional().describe("Natural-language task description to search for."),
        id: z.string().optional().describe("Exact task id to resume. Use after ls/resume returns candidates."),
        project: z.string().optional().describe("Optional project filter."),
        includeArchive: z
          .boolean()
          .optional()
          .describe("Whether archived handoff packets should also be searched. Defaults to false."),
      },
      outputSchema: resumeOutputSchema,
      annotations: readAnnotations,
    },
    async (input) => safeToolCall(() => service.resume(input)),
  );

  server.registerTool(
    "ls",
    {
      title: "List handoff tasks",
      description:
        "List or search saved Hando handoff packets. Use when the user asks what unfinished handoffs exist or when resume needs disambiguation. Returned items are handoff context candidates, not final answers.",
      inputSchema: {
        query: z.string().optional().describe("Optional search text for narrowing listed tasks."),
        project: z.string().optional().describe("Optional project filter."),
        archive: z.boolean().optional().describe("List archived handoff packets instead of active tasks."),
      },
      outputSchema: taskListOutputSchema,
      annotations: readAnnotations,
    },
    async (input) => safeToolCall(async () => ({ tasks: await service.list(input) })),
  );

  server.registerTool(
    "get",
    {
      title: "Get handoff task",
      description:
        "Read a full saved Hando handoff packet by id. Use after ls/resume returns candidates and a specific id is chosen. Returned content is context for continuing work, not the final answer.",
      inputSchema: {
        id: z.string().min(1).describe("Task id to read."),
        archive: z.boolean().optional().describe("Read from archive instead of active tasks."),
      },
      outputSchema: taskRecordOutputSchema,
      annotations: readAnnotations,
    },
    async (input) => safeToolCall(() => service.get(input.id, input.archive)),
  );

  server.registerTool(
    "archive",
    {
      title: "Archive handoff task",
      description:
        "Move a completed handoff packet out of active tasks into archive. Use only when the task is finished or the user explicitly asks to archive/done it. This is reversible with restore.",
      inputSchema: {
        id: z.string().min(1).describe("Task id to archive."),
      },
      outputSchema: taskRecordOutputSchema,
      annotations: writeAnnotations,
    },
    async (input) => safeToolCall(() => service.archive(input)),
  );

  server.registerTool(
    "restore",
    {
      title: "Restore handoff task",
      description:
        "Move an archived handoff packet back into active tasks. Use when the user wants to continue or reopen an archived handoff.",
      inputSchema: {
        id: z.string().min(1).describe("Archived task id to restore."),
      },
      outputSchema: taskRecordOutputSchema,
      annotations: writeAnnotations,
    },
    async (input) => safeToolCall(() => service.restore(input)),
  );

  return server;
}

const readAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
} satisfies ToolAnnotations;

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} satisfies ToolAnnotations;

const taskLocationSchema = z.enum(["active", "archive"]);

const taskMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  project: z.string().optional(),
  cwd: z.string(),
  gitRemote: z.string().optional(),
  branch: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
});

const taskRecordSchema = z.object({
  meta: taskMetaSchema,
  body: z.string(),
  location: taskLocationSchema,
  filePath: z.string(),
});

const candidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  project: z.string().optional(),
  updatedAt: z.string(),
  location: taskLocationSchema,
  score: z.number(),
});

const resumeResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("match"),
    task: taskRecordSchema,
  }),
  z.object({
    kind: z.literal("candidates"),
    candidates: z.array(candidateSchema),
    message: z.string(),
  }),
  z.object({
    kind: z.literal("empty"),
    message: z.string(),
  }),
]);

const taskRecordOutputSchema = z.object({
  ok: z.literal(true),
  data: taskRecordSchema,
});

const taskListOutputSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    tasks: z.array(taskRecordSchema),
  }),
});

const resumeOutputSchema = z.object({
  ok: z.literal(true),
  data: resumeResultSchema,
});

interface ErrorEnvelope extends Record<string, unknown> {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly field?: string;
    readonly details?: unknown;
  };
}

interface SuccessEnvelope<T> extends Record<string, unknown> {
  readonly ok: true;
  readonly data: T;
}

async function safeToolCall<T>(action: () => Promise<T>): Promise<CallToolResult> {
  try {
    return toolResult(await action());
  } catch (error) {
    return toolErrorResult(error);
  }
}

function toolResult<T>(value: T): CallToolResult {
  const envelope: SuccessEnvelope<T> = {
    ok: true,
    data: value,
  };
  return {
    structuredContent: envelope,
    content: [
      {
        type: "text" as const,
        text: formatJson(envelope),
      },
    ],
  };
}

export function toolErrorResult(error: unknown): CallToolResult {
  const envelope = errorEnvelope(error);
  return {
    isError: true,
    structuredContent: envelope,
    content: [
      {
        type: "text" as const,
        text: formatJson(envelope),
      },
    ],
  };
}

function errorEnvelope(error: unknown): ErrorEnvelope {
  if (error instanceof HandoError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        field: error.field,
        details: error.details,
      },
    };
  }
  if (error instanceof Error) {
    return {
      ok: false,
      error: {
        code: "internal_error",
        message: error.message,
      },
    };
  }
  return {
    ok: false,
    error: {
      code: "unknown_error",
      message: String(error),
    },
  };
}
