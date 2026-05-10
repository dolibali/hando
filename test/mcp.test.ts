import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp.js";
import { getHandoPaths } from "../src/paths.js";
import { HandoService } from "../src/storage.js";

async function createMcpClient() {
  const home = await mkdtemp(join(tmpdir(), "hando-mcp-"));
  const server = createMcpServer(new HandoService(getHandoPaths(home)));
  const client = new Client(
    {
      name: "hando-test-client",
      version: "0.0.1",
    },
    {
      capabilities: {},
    },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

async function withMcpClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const { client, server } = await createMcpClient();
  try {
    return await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("hando MCP", () => {
  it("advertises model-friendly tool metadata", async () => {
    await withMcpClient(async (client) => {
      const { tools } = await client.listTools();
      const save = tools.find((tool) => tool.name === "save");
      const resume = tools.find((tool) => tool.name === "resume");
      const list = tools.find((tool) => tool.name === "ls");
      const get = tools.find((tool) => tool.name === "get");
      const archive = tools.find((tool) => tool.name === "archive");
      const restore = tools.find((tool) => tool.name === "restore");

      expect(save?.title).toBe("Save handoff task");
      expect(save?.description).toContain("Agent writes the task context in summary");
      expect(save?.description).toContain("Hando stores and retrieves it");
      expect(save?.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: false });
      expect(save?.inputSchema.properties?.title).toMatchObject({
        description: expect.stringContaining("Real task name"),
      });
      expect(save?.inputSchema.properties?.summary).toMatchObject({
        description: expect.stringContaining("Required when creating a new task"),
      });
      expect(save?.outputSchema).toBeDefined();

      for (const tool of [resume, list, get]) {
        expect(tool?.description).toBeTruthy();
        expect(tool?.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
        expect(tool?.outputSchema).toBeDefined();
      }

      for (const tool of [archive, restore]) {
        expect(tool?.description).toBeTruthy();
        expect(tool?.annotations).toMatchObject({
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: false,
        });
        expect(tool?.outputSchema).toBeDefined();
      }
    });
  });

  it("returns structured success envelopes for tool calls", async () => {
    await withMcpClient(async (client) => {
      const save = await callTool(client, "save", {
        title: "Implement MCP envelopes",
        summary: "Background, progress, next steps, risks, validation, and instructions.",
      });
      const saved = getStructuredContent(save);
      expect(saved.ok).toBe(true);
      expect(readPath(saved, ["data", "meta", "id"])).toBe("implement-mcp-envelopes");

      const resume = await callTool(client, "resume", {
        query: "MCP envelopes",
      });
      const resumed = getStructuredContent(resume);
      expect(resumed.ok).toBe(true);
      expect(readPath(resumed, ["data", "kind"])).toBe("match");
      expect(readPath(resumed, ["data", "task", "meta", "id"])).toBe("implement-mcp-envelopes");

      const list = await callTool(client, "ls", {});
      const listed = getStructuredContent(list);
      expect(listed.ok).toBe(true);
      const tasks = readPath(listed, ["data", "tasks"]);
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks).toHaveLength(1);
    });
  });

  it("returns structured error envelopes for business errors", async () => {
    await withMcpClient(async (client) => {
      const result = await callTool(client, "save", {
        title: "Empty shell task",
      });
      const structured = getStructuredContent(result);

      expect(result.isError).toBe(true);
      expect(structured).toMatchObject({
        ok: false,
        error: {
          code: "validation_failed",
          field: "summary",
        },
      });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining('"ok": false'),
      });
    });
  });
});

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const result = await client.callTool({
    name,
    arguments: args,
  });
  if ("toolResult" in result) {
    throw new Error(`unexpected task tool result for ${name}`);
  }
  return result;
}

function getStructuredContent(result: CallToolResult): Record<string, unknown> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent as Record<string, unknown>;
}

function readPath(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, value);
}
