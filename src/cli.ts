import { Command } from "commander";
import { HandoService } from "./storage.js";
import { formatError, formatJson, formatResumeResult, formatTask, formatTaskList } from "./format.js";
import { serveMcp } from "./mcp.js";

export function createCli(service = new HandoService()): Command {
  const program = new Command();
  program
    .name("hando")
    .description("Local-first AI agent handoff packets")
    .version("0.1.0")
    .showHelpAfterError();

  program
    .command("setup")
    .description("Create the local Hando directories and config file")
    .action(async () => {
      await runCliAction(async () => {
        const paths = await service.setup();
        console.log(formatJson(paths));
      });
    });

  program
    .command("doctor")
    .description("Check local Hando paths")
    .action(async () => {
      await runCliAction(async () => {
        console.log((await service.doctor()).join("\n"));
      });
    });

  program
    .command("ls")
    .description("List active handoff tasks")
    .option("--archive", "List archived tasks")
    .option("-p, --project <project>", "Filter by project")
    .option("-q, --query <query>", "Search query")
    .action(async (options: { archive?: boolean; project?: string; query?: string }) => {
      await runCliAction(async () => {
        const tasks = await service.list({
          archive: options.archive,
          project: options.project,
          query: options.query,
        });
        console.log(formatTaskList(tasks));
      });
    });

  program
    .command("save")
    .description("Create or update a handoff task")
    .argument("<title>", "Task name")
    .option("-s, --summary <summary>", "Handoff body")
    .option("-i, --id <id>", "Existing task id to update")
    .option("-p, --project <project>", "Project name")
    .option("-t, --tag <tag...>", "Tags")
    .action(
      async (
        title: string,
        options: {
          summary?: string;
          id?: string;
          project?: string;
          tag?: string[];
        },
      ) => {
        await runCliAction(async () => {
          const saved = await service.save({
            title,
            summary: options.summary,
            id: options.id,
            project: options.project,
            tags: options.tag,
          });
          console.log(`${saved.meta.id} - ${saved.meta.title}`);
        });
      },
    );

  program
    .command("resume")
    .description("Find and print a handoff task")
    .argument("[query]", "Natural language query")
    .option("-i, --id <id>", "Task id")
    .option("-p, --project <project>", "Project name")
    .option("--archive", "Include archive")
    .action(
      async (
        query: string | undefined,
        options: { id?: string; project?: string; archive?: boolean },
      ) => {
        await runCliAction(async () => {
          const result = await service.resume({
            query,
            id: options.id,
            project: options.project,
            includeArchive: options.archive,
          });
          console.log(formatResumeResult(result));
        });
      },
    );

  program
    .command("get")
    .description("Print a task by id")
    .argument("<id>", "Task id")
    .option("--archive", "Read from archive")
    .action(async (id: string, options: { archive?: boolean }) => {
      await runCliAction(async () => {
        const task = await service.get(id, options.archive);
        console.log(formatTask(task));
      });
    });

  program
    .command("archive")
    .description("Move a task into archive")
    .argument("<id>", "Task id")
    .action(async (id: string) => {
      await runCliAction(async () => {
        const task = await service.archive({ id });
        console.log(`${task.meta.id} archived`);
      });
    });

  program
    .command("done")
    .description("Alias for archive")
    .argument("<id>", "Task id")
    .action(async (id: string) => {
      await runCliAction(async () => {
        const task = await service.archive({ id });
        console.log(`${task.meta.id} archived`);
      });
    });

  program
    .command("restore")
    .description("Restore an archived task")
    .argument("<id>", "Task id")
    .action(async (id: string) => {
      await runCliAction(async () => {
        const task = await service.restore({ id });
        console.log(`${task.meta.id} restored`);
      });
    });

  program
    .command("serve")
    .description("Start the stdio MCP server")
    .action(async () => {
      await serveMcp(service);
    });

  program.action(async () => {
    await runCliAction(async () => {
      const tasks = await service.list();
      console.log(formatTaskList(tasks));
    });
  });

  return program;
}

async function runCliAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
}
