import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { GitHubAppService } from "./github-wrapper.js";
import { LinearTemplateService } from "./linear-wrapper.js";

export interface McpServerOptions {
  serverName: string;
  serverVersion: string;
  linearService: LinearTemplateService;
  githubService?: GitHubAppService;
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

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Array<{
      name: string;
      description: string;
      inputSchema: {
        type: "object";
        additionalProperties: boolean;
        properties: Record<string, unknown>;
        required?: string[];
      };
    }> = [
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
    ];

    if (options.githubService) {
      tools.push(
        {
          name: "github_list_installations",
          description: "List visible installations for the configured GitHub App.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {},
          },
        },
        {
          name: "github_list_repositories",
          description:
            "List repositories accessible by the GitHub App installation for a target owner.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              owner: {
                type: "string",
                description: "GitHub owner/org login. Defaults to GITHUB_APP_OWNER.",
              },
              perPage: {
                type: "number",
                description: "Number of repositories to return, 1-100. Defaults to 50.",
              },
            },
          },
        },
        {
          name: "github_list_templates",
          description: "List configured GitHub issue/pull request body templates.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {},
          },
        },
        {
          name: "github_validate_template",
          description: "Validate markdown body against a configured GitHub template.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              templateKey: {
                type: "string",
                description: "Template key such as issue-bug, issue-feature, pull-request.",
              },
              body: {
                type: "string",
                description: "Markdown body to validate.",
              },
            },
            required: ["body"],
          },
        },
        {
          name: "github_normalize_template",
          description:
            "Normalize markdown body to include required/optional sections for a GitHub template.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              templateKey: {
                type: "string",
                description: "Template key such as issue-bug, issue-feature, pull-request.",
              },
              body: {
                type: "string",
                description: "Markdown body to normalize.",
              },
            },
            required: ["body"],
          },
        },
        {
          name: "github_create_issue_from_template",
          description:
            "Create a GitHub issue using the selected template with strict section enforcement.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              owner: {
                type: "string",
                description: "GitHub owner/org login. Defaults to GITHUB_APP_OWNER.",
              },
              repo: { type: "string", description: "Repository name." },
              title: { type: "string", description: "Issue title." },
              templateKey: { type: "string", description: "Template key." },
              body: { type: "string", description: "Issue body markdown." },
              labels: {
                type: "array",
                items: { type: "string" },
                description: "Label names to apply.",
              },
              assignees: {
                type: "array",
                items: { type: "string" },
                description: "Assignee logins.",
              },
              milestone: {
                type: "number",
                description: "Milestone number.",
              },
              autofillMissingSections: {
                type: "boolean",
                description: "Auto-insert missing template sections before create.",
              },
            },
            required: ["repo", "title"],
          },
        },
        {
          name: "github_create_pull_request_from_template",
          description:
            "Create a GitHub pull request with template enforcement and guaranteed bound issue linkage.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              owner: {
                type: "string",
                description: "GitHub owner/org login. Defaults to GITHUB_APP_OWNER.",
              },
              repo: { type: "string", description: "Repository name." },
              title: { type: "string", description: "Pull request title." },
              head: { type: "string", description: "Head branch name." },
              base: { type: "string", description: "Base branch name." },
              templateKey: { type: "string", description: "Template key." },
              body: { type: "string", description: "Pull request body markdown." },
              draft: { type: "boolean", description: "Create as draft PR." },
              maintainerCanModify: {
                type: "boolean",
                description: "Allow repository maintainers to modify this pull request branch.",
              },
              autofillMissingSections: {
                type: "boolean",
                description: "Auto-insert missing template sections before create.",
              },
              bindingIssueTemplateKey: {
                type: "string",
                description:
                  "Template key for auto-created binding issue when no linked issue exists (defaults to issue-feature).",
              },
              bindingIssueTitle: {
                type: "string",
                description:
                  "Custom title for auto-created binding issue when no linked issue exists.",
              },
              bindingIssueBody: {
                type: "string",
                description:
                  "Custom body for auto-created binding issue when no linked issue exists.",
              },
              bindingIssueLabels: {
                type: "array",
                items: { type: "string" },
                description: "Label names for auto-created binding issue.",
              },
              bindingIssueAssignees: {
                type: "array",
                items: { type: "string" },
                description: "Assignee logins for auto-created binding issue.",
              },
              bindingIssueMilestone: {
                type: "number",
                description: "Milestone number for auto-created binding issue.",
              },
            },
            required: ["repo", "title", "head", "base"],
          },
        },
      );
    }

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments ?? {};

    try {
      switch (toolName) {
        case "linear_list_teams": {
          return jsonResponse(await options.linearService.listTeams());
        }
        case "linear_list_templates": {
          return jsonResponse(options.linearService.getTemplates());
        }
        case "linear_validate_template": {
          if (typeof args.description !== "string") {
            return jsonError("description must be a string.");
          }

          return jsonResponse(
            await options.linearService.validateTemplate({
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
            options.linearService.normalizeTemplate({
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
            await options.linearService.createIssueFromTemplate({
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
            await options.linearService.applyTemplateToIssue({
              issueId: args.issueId,
              templateKey: typeof args.templateKey === "string" ? args.templateKey : undefined,
            }),
          );
        }
        case "github_list_installations": {
          if (!options.githubService) {
            return jsonError("GitHub App is not configured. Set GITHUB_APP_* environment variables.");
          }

          return jsonResponse(await options.githubService.listInstallations());
        }
        case "github_list_repositories": {
          if (!options.githubService) {
            return jsonError("GitHub App is not configured. Set GITHUB_APP_* environment variables.");
          }

          return jsonResponse(
            await options.githubService.listRepositories({
              owner: typeof args.owner === "string" ? args.owner : undefined,
              perPage: typeof args.perPage === "number" ? args.perPage : undefined,
            }),
          );
        }
        case "github_list_templates": {
          if (!options.githubService) {
            return jsonError("GitHub App is not configured. Set GITHUB_APP_* environment variables.");
          }

          return jsonResponse(options.githubService.getTemplates());
        }
        case "github_validate_template": {
          if (!options.githubService) {
            return jsonError("GitHub App is not configured. Set GITHUB_APP_* environment variables.");
          }

          if (typeof args.body !== "string") {
            return jsonError("body must be a string.");
          }

          return jsonResponse(
            options.githubService.validateTemplate({
              templateKey: typeof args.templateKey === "string" ? args.templateKey : undefined,
              body: args.body,
            }),
          );
        }
        case "github_normalize_template": {
          if (!options.githubService) {
            return jsonError("GitHub App is not configured. Set GITHUB_APP_* environment variables.");
          }

          if (typeof args.body !== "string") {
            return jsonError("body must be a string.");
          }

          return jsonResponse(
            options.githubService.normalizeTemplate({
              templateKey: typeof args.templateKey === "string" ? args.templateKey : undefined,
              body: args.body,
            }),
          );
        }
        case "github_create_issue_from_template": {
          if (!options.githubService) {
            return jsonError("GitHub App is not configured. Set GITHUB_APP_* environment variables.");
          }

          if (typeof args.repo !== "string") {
            return jsonError("repo must be a string.");
          }

          if (typeof args.title !== "string") {
            return jsonError("title must be a string.");
          }

          return jsonResponse(
            await options.githubService.createIssueFromTemplate({
              owner: typeof args.owner === "string" ? args.owner : undefined,
              repo: args.repo,
              title: args.title,
              templateKey: typeof args.templateKey === "string" ? args.templateKey : undefined,
              body: typeof args.body === "string" ? args.body : undefined,
              labels: Array.isArray(args.labels)
                ? args.labels.filter((item): item is string => typeof item === "string")
                : undefined,
              assignees: Array.isArray(args.assignees)
                ? args.assignees.filter((item): item is string => typeof item === "string")
                : undefined,
              milestone: typeof args.milestone === "number" ? args.milestone : undefined,
              autofillMissingSections:
                typeof args.autofillMissingSections === "boolean"
                  ? args.autofillMissingSections
                  : undefined,
            }),
          );
        }
        case "github_create_pull_request_from_template": {
          if (!options.githubService) {
            return jsonError("GitHub App is not configured. Set GITHUB_APP_* environment variables.");
          }

          if (typeof args.repo !== "string") {
            return jsonError("repo must be a string.");
          }

          if (typeof args.title !== "string") {
            return jsonError("title must be a string.");
          }

          if (typeof args.head !== "string") {
            return jsonError("head must be a string.");
          }

          if (typeof args.base !== "string") {
            return jsonError("base must be a string.");
          }

          return jsonResponse(
            await options.githubService.createPullRequestFromTemplate({
              owner: typeof args.owner === "string" ? args.owner : undefined,
              repo: args.repo,
              title: args.title,
              head: args.head,
              base: args.base,
              templateKey: typeof args.templateKey === "string" ? args.templateKey : undefined,
              body: typeof args.body === "string" ? args.body : undefined,
              draft: typeof args.draft === "boolean" ? args.draft : undefined,
              maintainerCanModify:
                typeof args.maintainerCanModify === "boolean"
                  ? args.maintainerCanModify
                  : undefined,
              autofillMissingSections:
                typeof args.autofillMissingSections === "boolean"
                  ? args.autofillMissingSections
                  : undefined,
              bindingIssueTemplateKey:
                typeof args.bindingIssueTemplateKey === "string"
                  ? args.bindingIssueTemplateKey
                  : undefined,
              bindingIssueTitle:
                typeof args.bindingIssueTitle === "string"
                  ? args.bindingIssueTitle
                  : undefined,
              bindingIssueBody:
                typeof args.bindingIssueBody === "string" ? args.bindingIssueBody : undefined,
              bindingIssueLabels: Array.isArray(args.bindingIssueLabels)
                ? args.bindingIssueLabels.filter((item): item is string => typeof item === "string")
                : undefined,
              bindingIssueAssignees: Array.isArray(args.bindingIssueAssignees)
                ? args.bindingIssueAssignees.filter((item): item is string => typeof item === "string")
                : undefined,
              bindingIssueMilestone:
                typeof args.bindingIssueMilestone === "number"
                  ? args.bindingIssueMilestone
                  : undefined,
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
