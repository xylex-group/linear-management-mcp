import { loadConfig } from "./config.js";
import { GitHubAppService } from "./github-wrapper.js";
import { LinearTemplateService } from "./linear-wrapper.js";
import { ProductManagementEngineService } from "./product-engine.js";
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
  const githubService = config.github
    ? new GitHubAppService(
        config.github.appId,
        config.github.owner,
        config.github.privateKey,
        config.github.templates,
        config.github.templateStrictMode,
        config.github.defaultTemplate,
        config.github.apiBaseUrl,
      )
    : undefined;
  const productEngine = new ProductManagementEngineService(
    service,
    githubService,
    config.productEngine,
  );

  const server = createMcpServer({
    serverName: config.serverName,
    serverVersion: config.serverVersion,
    linearService: service,
    githubService,
    productEngine,
  });

  await runServer(server);
}

main().catch((error) => {
  // Stderr is appropriate for startup failures because MCP wire output uses stdout.
  console.error(`[linear-management-mcp] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
