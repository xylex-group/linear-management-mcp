import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { GitHubAppService } from "./github-wrapper.js";
import { LinearTemplateService } from "./linear-wrapper.js";
import {
  ProductManagementEngineService,
  type ProductEngineAnalyzeInput,
  type ProductEngineCreateInput,
  type ProductEngineScoreInput,
  type ProductGuardrailDefinition,
  type ProductInitiativeInput,
  type ProductKillCriterion,
  type ProductMetricDefinition,
  type ProductRequirementChecklist,
  type ProductSignalInput,
  type ProductSignalTarget,
} from "./product-engine.js";

export interface McpServerOptions {
  serverName: string;
  serverVersion: string;
  linearService: LinearTemplateService;
  githubService?: GitHubAppService;
  productEngine: ProductManagementEngineService;
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function evidenceQuality(value: unknown) {
  return value === "strong" || value === "medium" || value === "weak" ? value : undefined;
}

function portfolioBucket(value: unknown) {
  return value === "core" || value === "adjacent" || value === "transformational"
    ? value
    : undefined;
}

function parseMetricDefinition(value: unknown): ProductMetricDefinition | undefined {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.name !== "string" ||
    typeof record.formula !== "string" ||
    typeof record.timeframe !== "string" ||
    typeof record.dataSource !== "string"
  ) {
    return undefined;
  }

  return {
    name: record.name,
    formula: record.formula,
    timeframe: record.timeframe,
    dataSource: record.dataSource,
    target: typeof record.target === "string" ? record.target : undefined,
  };
}

function parseGuardrailDefinition(value: unknown): ProductGuardrailDefinition | undefined {
  const metric = parseMetricDefinition(value);
  const record = asRecord(value);
  if (!metric || !record) {
    return undefined;
  }

  return {
    ...metric,
    owner: typeof record.owner === "string" ? record.owner : undefined,
  };
}

function parseMetricDefinitions(value: unknown): ProductMetricDefinition[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const metrics = value
    .map((item) => parseMetricDefinition(item))
    .filter((metric): metric is ProductMetricDefinition => Boolean(metric));
  return metrics.length > 0 ? metrics : undefined;
}

function parseGuardrailDefinitions(value: unknown): ProductGuardrailDefinition[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const metrics = value
    .map((item) => parseGuardrailDefinition(item))
    .filter((metric): metric is ProductGuardrailDefinition => Boolean(metric));
  return metrics.length > 0 ? metrics : undefined;
}

function parseKillCriteria(value: unknown): ProductKillCriterion[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const criteria: ProductKillCriterion[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record || typeof record.condition !== "string") {
      continue;
    }

    criteria.push({
      type:
        record.type === "usage" ||
        record.type === "cost" ||
        record.type === "time" ||
        record.type === "guardrail" ||
        record.type === "evidence"
          ? record.type
          : undefined,
      condition: record.condition,
      threshold: typeof record.threshold === "string" ? record.threshold : undefined,
      deadline: typeof record.deadline === "string" ? record.deadline : undefined,
    });
  }

  return criteria.length > 0 ? criteria : undefined;
}

function parseRequirements(value: unknown): ProductRequirementChecklist | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    privacy: typeof record.privacy === "string" ? record.privacy : undefined,
    security: typeof record.security === "string" ? record.security : undefined,
    accessibility:
      typeof record.accessibility === "string" ? record.accessibility : undefined,
  };
}

function parseSignalTarget(value: unknown): ProductSignalTarget | undefined {
  const target = asRecord(value);
  if (!target) {
    return undefined;
  }

  const linear = asRecord(target.linear);
  const github = asRecord(target.github);

  return {
    linear: linear
      ? {
          teamId: typeof linear.teamId === "string" ? linear.teamId : undefined,
          templateKey: typeof linear.templateKey === "string" ? linear.templateKey : undefined,
          priority: typeof linear.priority === "number" ? linear.priority : undefined,
          labelIds: stringArray(linear.labelIds),
          assigneeId: typeof linear.assigneeId === "string" ? linear.assigneeId : undefined,
          stateId: typeof linear.stateId === "string" ? linear.stateId : undefined,
          projectId: typeof linear.projectId === "string" ? linear.projectId : undefined,
        }
      : undefined,
    github:
      github && typeof github.repo === "string"
        ? {
            owner: typeof github.owner === "string" ? github.owner : undefined,
            repo: github.repo,
            templateKey:
              typeof github.templateKey === "string" ? github.templateKey : undefined,
            labels: stringArray(github.labels),
            assignees: stringArray(github.assignees),
            milestone: typeof github.milestone === "number" ? github.milestone : undefined,
          }
        : undefined,
  };
}

function parseProductSignals(value: unknown): ProductSignalInput[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const signals: ProductSignalInput[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record || typeof record.title !== "string" || typeof record.evidence !== "string") {
      continue;
    }

    const signal: ProductSignalInput = {
      title: record.title,
      source: typeof record.source === "string" ? record.source : undefined,
      evidence: record.evidence,
      evidenceQuality: evidenceQuality(record.evidenceQuality),
      whatWouldChangeMind:
        typeof record.whatWouldChangeMind === "string" ? record.whatWouldChangeMind : undefined,
      impact: typeof record.impact === "string" ? record.impact : undefined,
      recommendation:
        typeof record.recommendation === "string" ? record.recommendation : undefined,
      acceptanceCriteria: stringArray(record.acceptanceCriteria),
      outcomeMetric: parseMetricDefinition(record.outcomeMetric),
      guardrailMetrics: parseGuardrailDefinitions(record.guardrailMetrics),
      killCriteria: parseKillCriteria(record.killCriteria),
      portfolioBucket: portfolioBucket(record.portfolioBucket),
      requirements: parseRequirements(record.requirements),
      confidence: typeof record.confidence === "number" ? record.confidence : undefined,
      severity:
        record.severity === "low" ||
        record.severity === "medium" ||
        record.severity === "high" ||
        record.severity === "urgent"
          ? record.severity
          : undefined,
      tags: stringArray(record.tags),
      target: parseSignalTarget(record.target),
    };
    signals.push(signal);
  }

  return signals;
}

function parseProductInitiatives(value: unknown): ProductInitiativeInput[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const initiatives: ProductInitiativeInput[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record || typeof record.title !== "string") {
      continue;
    }

    initiatives.push({
      title: record.title,
      outcome: typeof record.outcome === "string" ? record.outcome : undefined,
      evidence: typeof record.evidence === "string" ? record.evidence : undefined,
      evidenceQuality: evidenceQuality(record.evidenceQuality),
      whatWouldChangeMind:
        typeof record.whatWouldChangeMind === "string" ? record.whatWouldChangeMind : undefined,
      reach: typeof record.reach === "number" ? record.reach : undefined,
      impact: typeof record.impact === "number" ? record.impact : undefined,
      confidence: typeof record.confidence === "number" ? record.confidence : undefined,
      effort: typeof record.effort === "number" ? record.effort : undefined,
      ease: typeof record.ease === "number" ? record.ease : undefined,
      importance: typeof record.importance === "number" ? record.importance : undefined,
      satisfaction:
        typeof record.satisfaction === "number" ? record.satisfaction : undefined,
      costOfDelay:
        typeof record.costOfDelay === "number" ? record.costOfDelay : undefined,
      duration: typeof record.duration === "number" ? record.duration : undefined,
      portfolioBucket: portfolioBucket(record.portfolioBucket),
      metrics: parseMetricDefinitions(record.metrics),
      guardrails: parseGuardrailDefinitions(record.guardrails),
      killCriteria: parseKillCriteria(record.killCriteria),
      requirements: parseRequirements(record.requirements),
      tags: stringArray(record.tags),
      owner: typeof record.owner === "string" ? record.owner : undefined,
    });
  }

  return initiatives;
}

function parseDefaultLinear(value: unknown): ProductSignalTarget["linear"] | undefined {
  return parseSignalTarget({ linear: value })?.linear;
}

function parseDefaultGitHub(value: unknown): ProductSignalTarget["github"] | undefined {
  return parseSignalTarget({ github: value })?.github;
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
      {
        name: "product_engine_analyze_backlog",
        description:
          "Analyze Linear and GitHub work for stale issues, previous-cycle carry-over, and next-cycle candidates.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            includeLinear: {
              type: "boolean",
              description: "Whether to include Linear inventory. Defaults to true.",
            },
            linearTeamId: {
              type: "string",
              description: "Linear team ID. Defaults to LINEAR_DEFAULT_TEAM_ID.",
            },
            linearLimit: {
              type: "number",
              description: "Maximum Linear issues to inspect, 1-100. Defaults to 50.",
            },
            includeSubTeams: {
              type: "boolean",
              description: "Include Linear sub-team issues. Defaults to true.",
            },
            githubRepositories: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  owner: { type: "string", description: "GitHub owner/org login." },
                  repo: { type: "string", description: "Repository name." },
                },
                required: ["repo"],
              },
              description: "GitHub repositories to inspect when GitHub App auth is configured.",
            },
            githubState: {
              type: "string",
              description: "GitHub issue state to inspect: open, closed, or all. Defaults to open.",
            },
            githubLimitPerRepo: {
              type: "number",
              description: "Maximum GitHub issues per repository, 1-100. Defaults to 50.",
            },
            staleAfterDays: {
              type: "number",
              description: "Days without updates before an open item is stale.",
            },
            candidateLimit: {
              type: "number",
              description: "Maximum candidates returned per section.",
            },
            nextCycleCapacity: {
              type: "number",
              description: "Target number of next-cycle candidates.",
            },
            now: {
              type: "string",
              description: "Optional ISO timestamp used for deterministic stale analysis.",
            },
          },
        },
      },
      {
        name: "product_engine_create_proactive_issues",
        description:
          "Vet product signals with evidence, metrics, guardrails, kill criteria, and either plan or create issues.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            mode: {
              type: "string",
              description: "plan, create-linear, or create-github. Defaults to plan.",
            },
            confidenceThreshold: {
              type: "number",
              description: "Minimum signal confidence between 0 and 1.",
            },
            maxCreate: {
              type: "number",
              description: "Maximum qualified signals to create in one call.",
            },
            defaultLinear: {
              type: "object",
              additionalProperties: false,
              properties: {
                teamId: { type: "string" },
                templateKey: { type: "string" },
                priority: { type: "number" },
                labelIds: { type: "array", items: { type: "string" } },
                assigneeId: { type: "string" },
                stateId: { type: "string" },
                projectId: { type: "string" },
              },
            },
            defaultGitHub: {
              type: "object",
              additionalProperties: false,
              properties: {
                owner: { type: "string" },
                repo: { type: "string" },
                templateKey: { type: "string" },
                labels: { type: "array", items: { type: "string" } },
                assignees: { type: "array", items: { type: "string" } },
                milestone: { type: "number" },
              },
              required: ["repo"],
            },
            signals: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  source: { type: "string" },
                  evidence: { type: "string" },
                  evidenceQuality: { type: "string" },
                  whatWouldChangeMind: { type: "string" },
                  impact: { type: "string" },
                  recommendation: { type: "string" },
                  acceptanceCriteria: { type: "array", items: { type: "string" } },
                  outcomeMetric: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      formula: { type: "string" },
                      timeframe: { type: "string" },
                      dataSource: { type: "string" },
                      target: { type: "string" },
                    },
                    required: ["name", "formula", "timeframe", "dataSource"],
                  },
                  guardrailMetrics: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        name: { type: "string" },
                        formula: { type: "string" },
                        timeframe: { type: "string" },
                        dataSource: { type: "string" },
                        target: { type: "string" },
                        owner: { type: "string" },
                      },
                      required: ["name", "formula", "timeframe", "dataSource"],
                    },
                  },
                  killCriteria: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        type: { type: "string" },
                        condition: { type: "string" },
                        threshold: { type: "string" },
                        deadline: { type: "string" },
                      },
                      required: ["condition"],
                    },
                  },
                  portfolioBucket: { type: "string" },
                  requirements: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      privacy: { type: "string" },
                      security: { type: "string" },
                      accessibility: { type: "string" },
                    },
                  },
                  confidence: { type: "number" },
                  severity: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                  target: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      linear: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          teamId: { type: "string" },
                          templateKey: { type: "string" },
                          priority: { type: "number" },
                          labelIds: { type: "array", items: { type: "string" } },
                          assigneeId: { type: "string" },
                          stateId: { type: "string" },
                          projectId: { type: "string" },
                        },
                      },
                      github: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          owner: { type: "string" },
                          repo: { type: "string" },
                          templateKey: { type: "string" },
                          labels: { type: "array", items: { type: "string" } },
                          assignees: { type: "array", items: { type: "string" } },
                          milestone: { type: "number" },
                        },
                        required: ["repo"],
                      },
                    },
                  },
                },
                required: ["title", "evidence"],
              },
            },
          },
          required: ["signals"],
        },
      },
      {
        name: "product_engine_score_initiatives",
        description:
          "Score candidate initiatives with RICE, ICE, WSJF, or opportunity scoring and produce a Now/Next/Later roadmap with portfolio and governance checks.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            method: {
              type: "string",
              description: "rice, ice, wsjf, or opportunity. Defaults to rice.",
            },
            capacity: { type: "number", description: "Total planning capacity." },
            nowLimit: { type: "number", description: "Maximum Now roadmap items." },
            nextLimit: { type: "number", description: "Maximum Next roadmap items." },
            portfolioTarget: {
              type: "object",
              additionalProperties: false,
              properties: {
                core: { type: "number" },
                adjacent: { type: "number" },
                transformational: { type: "number" },
              },
            },
            initiatives: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  outcome: { type: "string" },
                  evidence: { type: "string" },
                  evidenceQuality: { type: "string" },
                  whatWouldChangeMind: { type: "string" },
                  reach: { type: "number" },
                  impact: { type: "number" },
                  confidence: { type: "number" },
                  effort: { type: "number" },
                  ease: { type: "number" },
                  importance: { type: "number" },
                  satisfaction: { type: "number" },
                  costOfDelay: { type: "number" },
                  duration: { type: "number" },
                  portfolioBucket: { type: "string" },
                  metrics: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        name: { type: "string" },
                        formula: { type: "string" },
                        timeframe: { type: "string" },
                        dataSource: { type: "string" },
                        target: { type: "string" },
                      },
                      required: ["name", "formula", "timeframe", "dataSource"],
                    },
                  },
                  guardrails: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        name: { type: "string" },
                        formula: { type: "string" },
                        timeframe: { type: "string" },
                        dataSource: { type: "string" },
                        target: { type: "string" },
                        owner: { type: "string" },
                      },
                      required: ["name", "formula", "timeframe", "dataSource"],
                    },
                  },
                  killCriteria: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        type: { type: "string" },
                        condition: { type: "string" },
                        threshold: { type: "string" },
                        deadline: { type: "string" },
                      },
                      required: ["condition"],
                    },
                  },
                  requirements: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      privacy: { type: "string" },
                      security: { type: "string" },
                      accessibility: { type: "string" },
                    },
                  },
                  tags: { type: "array", items: { type: "string" } },
                  owner: { type: "string" },
                },
                required: ["title"],
              },
            },
          },
          required: ["initiatives"],
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
        case "product_engine_analyze_backlog": {
          const repositories: ProductEngineAnalyzeInput["githubRepositories"] = [];
          if (Array.isArray(args.githubRepositories)) {
            for (const repository of args.githubRepositories) {
              const record = asRecord(repository);
              if (!record || typeof record.repo !== "string") {
                continue;
              }

              repositories.push({
                owner: typeof record.owner === "string" ? record.owner : undefined,
                repo: record.repo,
              });
            }
          }
          const githubState =
            args.githubState === "open" ||
            args.githubState === "closed" ||
            args.githubState === "all"
              ? args.githubState
              : undefined;
          const input: ProductEngineAnalyzeInput = {
            includeLinear:
              typeof args.includeLinear === "boolean" ? args.includeLinear : undefined,
            linearTeamId: typeof args.linearTeamId === "string" ? args.linearTeamId : undefined,
            linearLimit: typeof args.linearLimit === "number" ? args.linearLimit : undefined,
            includeSubTeams:
              typeof args.includeSubTeams === "boolean" ? args.includeSubTeams : undefined,
            githubRepositories: repositories.length > 0 ? repositories : undefined,
            githubState,
            githubLimitPerRepo:
              typeof args.githubLimitPerRepo === "number"
                ? args.githubLimitPerRepo
                : undefined,
            staleAfterDays:
              typeof args.staleAfterDays === "number" ? args.staleAfterDays : undefined,
            candidateLimit:
              typeof args.candidateLimit === "number" ? args.candidateLimit : undefined,
            nextCycleCapacity:
              typeof args.nextCycleCapacity === "number" ? args.nextCycleCapacity : undefined,
            now: typeof args.now === "string" ? args.now : undefined,
          };

          return jsonResponse(await options.productEngine.analyzeBacklog(input));
        }
        case "product_engine_create_proactive_issues": {
          const signals = parseProductSignals(args.signals);
          if (!signals) {
            return jsonError("signals must be an array of objects with title and evidence.");
          }

          const mode =
            args.mode === "plan" ||
            args.mode === "create-linear" ||
            args.mode === "create-github"
              ? args.mode
              : undefined;
          const input: ProductEngineCreateInput = {
            signals,
            mode,
            confidenceThreshold:
              typeof args.confidenceThreshold === "number"
                ? args.confidenceThreshold
                : undefined,
            maxCreate: typeof args.maxCreate === "number" ? args.maxCreate : undefined,
            defaultLinear: parseDefaultLinear(args.defaultLinear),
            defaultGitHub: parseDefaultGitHub(args.defaultGitHub),
          };

          return jsonResponse(await options.productEngine.createProactiveIssues(input));
        }
        case "product_engine_score_initiatives": {
          const initiatives = parseProductInitiatives(args.initiatives);
          if (!initiatives) {
            return jsonError("initiatives must be an array of objects with at least a title.");
          }

          const method =
            args.method === "rice" ||
            args.method === "ice" ||
            args.method === "wsjf" ||
            args.method === "opportunity"
              ? args.method
              : undefined;
          const target = asRecord(args.portfolioTarget);
          const input: ProductEngineScoreInput = {
            initiatives,
            method,
            capacity: typeof args.capacity === "number" ? args.capacity : undefined,
            nowLimit: typeof args.nowLimit === "number" ? args.nowLimit : undefined,
            nextLimit: typeof args.nextLimit === "number" ? args.nextLimit : undefined,
            portfolioTarget: target
              ? {
                  core: typeof target.core === "number" ? target.core : undefined,
                  adjacent:
                    typeof target.adjacent === "number" ? target.adjacent : undefined,
                  transformational:
                    typeof target.transformational === "number"
                      ? target.transformational
                      : undefined,
                }
              : undefined,
          };

          return jsonResponse(options.productEngine.scoreInitiatives(input));
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
