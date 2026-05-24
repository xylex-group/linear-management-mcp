import { loadConfig } from "./config.js";
import { LinearTemplateService } from "./linear-wrapper.js";
import { createMcpServer, runServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const service = new LinearTemplateService(
    config.apiKey,
    config.templates,
    config.templateStrictMode,
    config.defaultTeamId,
    config.defaultTemplate,
  );

  const server = createMcpServer({
    serverName: config.serverName,
    serverVersion: config.serverVersion,
    service,
  });

  await runServer(server);
}

main().catch((error) => {
  // Stderr is appropriate for startup failures because MCP wire output uses stdout.
  console.error(`[linear-management-mcp] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

