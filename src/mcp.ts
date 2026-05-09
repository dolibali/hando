import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { formatError, formatJson } from "./format.js";
import { HandoService } from "./storage.js";

export async function serveMcp(service = new HandoService()): Promise<void> {
  const server = createMcpServer(service);
  await server.connect(new StdioServerTransport());
}

export function createMcpServer(service = new HandoService()): McpServer {
  const server = new McpServer({
    name: "hando",
    version: "0.1.0",
  });

  server.registerTool(
    "save",
    {
      title: "Save handoff task",
      description:
        "Create or update a Hando task handoff packet. Use when the user asks to save progress, hand off to another AI agent, or when the current agent may stop soon. The title must be the real task name.",
      inputSchema: {
        title: z.string().min(1),
        summary: z.string().optional(),
        id: z.string().optional(),
        project: z.string().optional(),
        tags: z.array(z.string()).optional(),
        agent: z.string().optional(),
      },
    },
    async (input) => toolResult(await service.save(input)),
  );

  server.registerTool(
    "resume",
    {
      title: "Resume handoff task",
      description:
        "Find and return a saved handoff packet for a coding task. Use when the user asks to continue previous work from another AI agent.",
      inputSchema: {
        query: z.string().optional(),
        id: z.string().optional(),
        project: z.string().optional(),
        includeArchive: z.boolean().optional(),
      },
    },
    async (input) => toolResult(await service.resume(input)),
  );

  server.registerTool(
    "ls",
    {
      title: "List handoff tasks",
      description: "List or search Hando task handoff packets.",
      inputSchema: {
        query: z.string().optional(),
        project: z.string().optional(),
        archive: z.boolean().optional(),
      },
    },
    async (input) => toolResult(await service.list(input)),
  );

  server.registerTool(
    "get",
    {
      title: "Get handoff task",
      description: "Read a full handoff task by id.",
      inputSchema: {
        id: z.string().min(1),
        archive: z.boolean().optional(),
      },
    },
    async (input) => toolResult(await service.get(input.id, input.archive)),
  );

  server.registerTool(
    "archive",
    {
      title: "Archive handoff task",
      description: "Move a completed handoff task out of active tasks.",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async (input) => toolResult(await service.archive(input)),
  );

  server.registerTool(
    "restore",
    {
      title: "Restore handoff task",
      description: "Move an archived handoff task back into active tasks.",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async (input) => toolResult(await service.restore(input)),
  );

  return server;
}

function toolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: formatJson(value),
      },
    ],
  };
}

export function toolErrorResult(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: formatError(error),
      },
    ],
  };
}
