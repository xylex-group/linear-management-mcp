import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { LinearTemplateService } from "./linear-wrapper.js";

export interface McpServerOptions {
  serverName: string;
  serverVersion: string;
  service: LinearTemplateService;
}

function jsonResponse(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function jsonError(message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
    isError: true,
  };
}

export function createMcpServer(options: McpServerOptions): Server {
  const server = new Server({
    name: options.serverName,
    version: options.serverVersion,
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "linear_list_teams",
        description: "List teams visible to the configured Linear API key.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      {
        name: "linear_list_templates",
        description: "List configured issue templates and required sections.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      {
        name: "linear_validate_template",
        description: "Validate issue description markdown against a template.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            templateKey: {
              type: "string",
              description: "Template key such as bug, feature-request, engineering-task.",
            },
            description: {
              type: "string",
              description: "Issue description markdown to validate.",
            },
          },
          required: ["description"],
        },
      },
      {
        name: "linear_normalize_template",
        description:
          "Normalize issue description markdown to include required/optional template sections.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            templateKey: {
              type: "string",
              description: "Template key such as bug, feature-request, engineering-task.",
            },
            description: {
              type: "string",
              description: "Issue description markdown to normalize.",
            },
          },
          required: ["description"],
        },
      },
      {
        name: "linear_create_issue_from_template",
        description:
          "Create a Linear issue using a template, enforcing required sections in description.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", description: "Issue title." },
            templateKey: { type: "string", description: "Template key." },
            teamId: {
              type: "string",
              description: "Linear team ID. Optional when LINEAR_DEFAULT_TEAM_ID is set.",
            },
            description: { type: "string", description: "Issue description markdown." },
            priority: { type: "number", description: "Linear priority (0-4)." },
            labelIds: {
              type: "array",
              items: { type: "string" },
              description: "Linear label IDs.",
            },
            assigneeId: { type: "string", description: "Linear user ID for assignee." },
            stateId: { type: "string", description: "Linear workflow state ID." },
            projectId: { type: "string", description: "Linear project ID." },
            autofillMissingSections: {
              type: "boolean",
              description: "Auto-insert missing required sections before issue creation.",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "linear_apply_template_to_issue",
        description:
          "Normalize an existing issue description to enforce the selected template structure.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            issueId: {
              type: "string",
              description: "Issue ID or identifier (for example, ENG-123).",
            },
            templateKey: { type: "string", description: "Template key." },
          },
          required: ["issueId"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments ?? {};

    try {
      switch (toolName) {
        case "linear_list_teams": {
          return jsonResponse(await options.service.listTeams());
        }
        case "linear_list_templates": {
          return jsonResponse(options.service.getTemplates());
        }
        case "linear_validate_template": {
          if (typeof args.description !== "string") {
            return jsonError("description must be a string.");
          }

          return jsonResponse(
            await options.service.validateTemplate({
              templateKey: typeof args.templateKey === "string" ? args.templateKey : undefined,
              description: args.description,
            }),
          );
        }
        case "linear_normalize_template": {
          if (typeof args.description !== "string") {
            return jsonError("description must be a string.");
          }

          return jsonResponse(
            options.service.normalizeTemplate({
              templateKey: typeof args.templateKey === "string" ? args.templateKey : undefined,
              description: args.description,
            }),
          );
        }
        case "linear_create_issue_from_template": {
          if (typeof args.title !== "string") {
            return jsonError("title must be a string.");
          }

          return jsonResponse(
            await options.service.createIssueFromTemplate({
              title: args.title,
              templateKey: typeof args.templateKey === "string" ? args.templateKey : undefined,
              teamId: typeof args.teamId === "string" ? args.teamId : undefined,
              description: typeof args.description === "string" ? args.description : undefined,
              priority: typeof args.priority === "number" ? args.priority : undefined,
              labelIds: Array.isArray(args.labelIds)
                ? args.labelIds.filter((item): item is string => typeof item === "string")
                : undefined,
              assigneeId: typeof args.assigneeId === "string" ? args.assigneeId : undefined,
              stateId: typeof args.stateId === "string" ? args.stateId : undefined,
              projectId: typeof args.projectId === "string" ? args.projectId : undefined,
              autofillMissingSections:
                typeof args.autofillMissingSections === "boolean"
                  ? args.autofillMissingSections
                  : undefined,
            }),
          );
        }
        case "linear_apply_template_to_issue": {
          if (typeof args.issueId !== "string") {
            return jsonError("issueId must be a string.");
          }

          return jsonResponse(
            await options.service.applyTemplateToIssue({
              issueId: args.issueId,
              templateKey: typeof args.templateKey === "string" ? args.templateKey : undefined,
            }),
          );
        }
        default:
          return jsonError(`Unknown tool '${toolName}'.`);
      }
    } catch (error) {
      return jsonError((error as Error).message);
    }
  });

  return server;
}

export async function runServer(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

