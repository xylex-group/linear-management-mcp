import type {
  GitHubAppService,
  GitHubIssueInventoryItem,
  GitHubRepositoryRef,
} from "./github-wrapper.js";
import type {
  LinearCycleInventoryItem,
  LinearIssueInventoryItem,
  LinearTemplateService,
} from "./linear-wrapper.js";

type IssueSource = "linear" | "github";
type ProactiveIssueMode = "plan" | "create-linear" | "create-github";
export type EvidenceQuality = "strong" | "medium" | "weak";
export type PortfolioBucket = "core" | "adjacent" | "transformational";
export type PrioritizationMethod = "rice" | "ice" | "wsjf" | "opportunity";
export type RoadmapHorizon = "now" | "next" | "later" | "park";

export interface ProductManagementEngineConfig {
  staleAfterDays: number;
  nextCycleCapacity: number;
  signalConfidenceThreshold: number;
}

export interface ProductEngineAnalyzeInput {
  includeLinear?: boolean;
  linearTeamId?: string;
  linearLimit?: number;
  includeSubTeams?: boolean;
  githubRepositories?: GitHubRepositoryRef[];
  githubState?: "open" | "closed" | "all";
  githubLimitPerRepo?: number;
  staleAfterDays?: number;
  candidateLimit?: number;
  nextCycleCapacity?: number;
  now?: string;
}

export interface ProductSignalTarget {
  linear?: {
    teamId?: string;
    templateKey?: string;
    priority?: number;
    labelIds?: string[];
    assigneeId?: string;
    stateId?: string;
    projectId?: string;
  };
  github?: {
    owner?: string;
    repo: string;
    templateKey?: string;
    labels?: string[];
    assignees?: string[];
    milestone?: number;
  };
}

export interface ProductMetricDefinition {
  name: string;
  formula: string;
  timeframe: string;
  dataSource: string;
  target?: string;
}

export interface ProductGuardrailDefinition extends ProductMetricDefinition {
  owner?: string;
}

export interface ProductKillCriterion {
  type?: "usage" | "cost" | "time" | "guardrail" | "evidence";
  condition: string;
  threshold?: string;
  deadline?: string;
}

export interface ProductRequirementChecklist {
  privacy?: string;
  security?: string;
  accessibility?: string;
}

export interface ProductSignalInput {
  title: string;
  source?: string;
  evidence: string;
  evidenceQuality?: EvidenceQuality;
  whatWouldChangeMind?: string;
  impact?: string;
  recommendation?: string;
  acceptanceCriteria?: string[];
  outcomeMetric?: ProductMetricDefinition;
  guardrailMetrics?: ProductGuardrailDefinition[];
  killCriteria?: ProductKillCriterion[];
  portfolioBucket?: PortfolioBucket;
  requirements?: ProductRequirementChecklist;
  confidence?: number;
  severity?: "low" | "medium" | "high" | "urgent";
  tags?: string[];
  target?: ProductSignalTarget;
}

export interface ProductEngineCreateInput {
  signals: ProductSignalInput[];
  mode?: ProactiveIssueMode;
  confidenceThreshold?: number;
  maxCreate?: number;
  defaultLinear?: ProductSignalTarget["linear"];
  defaultGitHub?: ProductSignalTarget["github"];
}

export interface ProductInitiativeInput {
  title: string;
  outcome?: string;
  evidence?: string;
  evidenceQuality?: EvidenceQuality;
  whatWouldChangeMind?: string;
  reach?: number;
  impact?: number;
  confidence?: number;
  effort?: number;
  ease?: number;
  importance?: number;
  satisfaction?: number;
  costOfDelay?: number;
  duration?: number;
  portfolioBucket?: PortfolioBucket;
  metrics?: ProductMetricDefinition[];
  guardrails?: ProductGuardrailDefinition[];
  killCriteria?: ProductKillCriterion[];
  requirements?: ProductRequirementChecklist;
  tags?: string[];
  owner?: string;
}

export interface ProductEngineScoreInput {
  initiatives: ProductInitiativeInput[];
  method?: PrioritizationMethod;
  capacity?: number;
  nowLimit?: number;
  nextLimit?: number;
  portfolioTarget?: Partial<Record<PortfolioBucket, number>>;
}

interface NormalizedWorkItem {
  source: IssueSource;
  id: string;
  key: string;
  title: string;
  url: string;
  body?: string;
  state: string;
  labels: string[];
  assignees: string[];
  portfolioBucket: PortfolioBucket;
  priority?: number;
  priorityLabel?: string;
  sourceOwner?: string;
  sourceRepo?: string;
  sourceTeamId?: string;
  cycleId?: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  staleDays: number;
  isClosed: boolean;
}

interface ScoredWorkItem extends NormalizedWorkItem {
  score: number;
  reasons: string[];
  recommendedAction: string;
  governanceGaps: string[];
}

interface CycleContext {
  activeCycle?: LinearCycleInventoryItem;
  nextCycle?: LinearCycleInventoryItem;
  previousCycle?: LinearCycleInventoryItem;
  cycles: LinearCycleInventoryItem[];
}

function clampInteger(value: number | undefined, defaultValue: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.min(Math.max(Math.trunc(value), 1), max);
}

function clampRatio(value: number | undefined, defaultValue: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.min(Math.max(value, 0), 1);
}

function normalizeDate(raw: string | undefined, fallback: Date): Date {
  if (!raw) {
    return fallback;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date '${raw}'. Use an ISO timestamp.`);
  }

  return parsed;
}

function daysSince(raw: string, now: Date): number {
  const parsed = normalizeDate(raw, now);
  const diffMs = now.getTime() - parsed.getTime();
  return Math.max(Math.floor(diffMs / 86_400_000), 0);
}

function containsAny(values: string[], matches: string[]): boolean {
  const normalized = values.map((value) => value.toLowerCase());
  return matches.some((match) => normalized.some((value) => value.includes(match)));
}

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function metricIsDefined(metric: ProductMetricDefinition | undefined): boolean {
  return Boolean(
    metric?.name?.trim() &&
      metric.formula?.trim() &&
      metric.timeframe?.trim() &&
      metric.dataSource?.trim(),
  );
}

function evidenceQualityScore(quality: EvidenceQuality | undefined): number {
  switch (quality) {
    case "strong":
      return 30;
    case "medium":
      return 15;
    case "weak":
      return -20;
    default:
      return 0;
  }
}

function formatMetric(metric: ProductMetricDefinition | undefined): string {
  if (!metric) {
    return "_TODO: define metric name, formula, timeframe, and data source._";
  }

  return [
    `Name: ${metric.name}`,
    `Formula: ${metric.formula}`,
    `Timeframe: ${metric.timeframe}`,
    `Data Source: ${metric.dataSource}`,
    metric.target ? `Target: ${metric.target}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function formatMetricList(metrics: ProductGuardrailDefinition[] | undefined): string {
  if (!metrics || metrics.length === 0) {
    return "- _TODO: define guardrail metrics and owners._";
  }

  return metrics
    .map((metric) => {
      const owner = metric.owner ? `\n  Owner: ${metric.owner}` : "";
      return `- ${metric.name}\n  Formula: ${metric.formula}\n  Timeframe: ${metric.timeframe}\n  Data Source: ${metric.dataSource}${
        metric.target ? `\n  Target: ${metric.target}` : ""
      }${owner}`;
    })
    .join("\n");
}

function formatKillCriteria(criteria: ProductKillCriterion[] | undefined): string {
  if (!criteria || criteria.length === 0) {
    return "- _TODO: define explicit stop conditions before committing build capacity._";
  }

  return criteria
    .map((criterion) => {
      const parts = [
        criterion.type ? `Type: ${criterion.type}` : undefined,
        `Condition: ${criterion.condition}`,
        criterion.threshold ? `Threshold: ${criterion.threshold}` : undefined,
        criterion.deadline ? `Deadline: ${criterion.deadline}` : undefined,
      ].filter((part): part is string => Boolean(part));

      return `- ${parts.join("; ")}`;
    })
    .join("\n");
}

function formatRequirementChecklist(requirements: ProductRequirementChecklist | undefined): string {
  return [
    `Privacy: ${requirements?.privacy?.trim() || "_TODO: define data purpose, retention, and access controls._"}`,
    `Security: ${requirements?.security?.trim() || "_TODO: define security review needs._"}`,
    `Accessibility: ${
      requirements?.accessibility?.trim() || "_TODO: define accessibility expectations._"
    }`,
  ].join("\n");
}

function classifyPortfolioBucket(values: string[]): PortfolioBucket {
  if (containsAny(values, ["transformational", "moonshot", "new market", "ai", "platform bet"])) {
    return "transformational";
  }

  if (containsAny(values, ["adjacent", "expansion", "integration", "enterprise", "new segment"])) {
    return "adjacent";
  }

  return "core";
}

function severityScore(severity: ProductSignalInput["severity"]): number {
  switch (severity) {
    case "urgent":
      return 40;
    case "high":
      return 28;
    case "medium":
      return 16;
    case "low":
      return 8;
    default:
      return 12;
  }
}

function priorityFromSeverity(severity: ProductSignalInput["severity"]): number {
  switch (severity) {
    case "urgent":
      return 1;
    case "high":
      return 2;
    case "low":
      return 4;
    case "medium":
    default:
      return 3;
  }
}

function linearPriorityScore(priority: number | undefined): number {
  switch (priority) {
    case 1:
      return 90;
    case 2:
      return 75;
    case 3:
      return 55;
    case 4:
      return 35;
    default:
      return 25;
  }
}

function formatIssueBody(signal: ProductSignalInput): string {
  const criteria =
    signal.acceptanceCriteria && signal.acceptanceCriteria.length > 0
      ? signal.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")
      : "- _TODO: define acceptance criteria._";
  const tags = signal.tags && signal.tags.length > 0 ? signal.tags.join(", ") : "none";
  const evidenceQuality = signal.evidenceQuality ?? "not classified";

  return [
    `## Signal\n${signal.source ? `Source: ${signal.source}\n\n` : ""}${signal.title}`,
    `## Customer/User Impact\n${signal.impact?.trim() || "_TODO: describe product impact._"}`,
    `## Proposed Outcome\n${
      signal.recommendation?.trim() || "_TODO: describe the intended product outcome._"
    }`,
    `## Outcome Metric\n${formatMetric(signal.outcomeMetric)}`,
    `## Guardrails\n${formatMetricList(signal.guardrailMetrics)}\n\n${formatRequirementChecklist(
      signal.requirements,
    )}`,
    `## Evidence\nQuality: ${evidenceQuality}\n\n${signal.evidence.trim()}`,
    `## Acceptance Criteria\n${criteria}`,
    `## Kill Criteria\n${formatKillCriteria(signal.killCriteria)}`,
    `## What Would Change My Mind\n${
      signal.whatWouldChangeMind?.trim() ||
      "_TODO: name the evidence that would stop, reverse, or descope this bet._"
    }`,
    `## Risk And Dependencies\nSeverity: ${signal.severity ?? "medium"}\nConfidence: ${
      signal.confidence ?? "not provided"
    }\nTags: ${tags}`,
    `## Portfolio Bet\nBucket: ${signal.portfolioBucket ?? "core"}`,
    "## Cycle Fit\nEvaluate for the next planning cycle unless urgency requires immediate triage.",
  ].join("\n\n");
}

export class ProductManagementEngineService {
  constructor(
    private readonly linearService: LinearTemplateService,
    private readonly githubService: GitHubAppService | undefined,
    private readonly config: ProductManagementEngineConfig,
  ) {}

  async analyzeBacklog(input: ProductEngineAnalyzeInput = {}) {
    const now = normalizeDate(input.now, new Date());
    const staleAfterDays = clampInteger(
      input.staleAfterDays,
      this.config.staleAfterDays,
      365,
    );
    const candidateLimit = clampInteger(input.candidateLimit, 10, 50);
    const nextCycleCapacity = clampInteger(
      input.nextCycleCapacity,
      this.config.nextCycleCapacity,
      100,
    );

    const includeLinear = input.includeLinear ?? true;
    const githubRepositories = input.githubRepositories ?? [];
    if (githubRepositories.length > 0 && !this.githubService) {
      throw new Error("GitHub App is not configured. Set GITHUB_APP_* before using GitHub analysis.");
    }

    const linearPromise = includeLinear
      ? Promise.all([
          this.linearService.listIssueInventory({
            teamId: input.linearTeamId,
            limit: input.linearLimit,
            includeSubTeams: input.includeSubTeams,
          }),
          this.linearService.listCycleInventory({
            teamId: input.linearTeamId,
          }),
        ])
      : Promise.resolve(null);

    const githubPromise = this.githubService
      ? Promise.all(
          githubRepositories.map((repository) =>
            this.githubService!.listIssueInventory({
              owner: repository.owner,
              repo: repository.repo,
              state: input.githubState ?? "open",
              perPage: input.githubLimitPerRepo,
            }),
          ),
        )
      : Promise.resolve([]);

    const [linearSnapshot, githubSnapshots] = await Promise.all([
      linearPromise,
      githubPromise,
    ]);
    const linearIssues = linearSnapshot?.[0].issues ?? [];
    const cycleContext = this.buildCycleContext(linearSnapshot?.[1].cycles ?? []);
    const githubIssues = githubSnapshots.flatMap((snapshot) =>
      snapshot.issues.map((issue) => ({
        issue,
        owner: snapshot.owner,
        repo: snapshot.repo,
      })),
    );

    const workItems = [
      ...linearIssues.map((issue) => this.fromLinearIssue(issue, now)),
      ...githubIssues.map(({ issue, owner, repo }) =>
        this.fromGitHubIssue(issue, owner, repo, now),
      ),
    ];
    const openItems = workItems.filter((item) => !item.isClosed);
    const scoredItems = openItems
      .map((item) =>
        this.scoreWorkItem(item, {
          staleAfterDays,
          nextCycle: cycleContext.nextCycle,
          previousCycle: cycleContext.previousCycle,
        }),
      )
      .sort((left, right) => right.score - left.score || right.staleDays - left.staleDays);
    const staleItems = scoredItems
      .filter((item) => item.staleDays >= staleAfterDays)
      .map((item) => ({
        ...item,
        recommendedAction: item.cycleId
          ? "Review stale cycle work and either recommit, split, or close it."
          : "Review stale backlog work and either move it into triage or close it.",
      }))
      .sort((left, right) => right.staleDays - left.staleDays || right.score - left.score);
    const nextCycleCandidates = scoredItems.slice(0, nextCycleCapacity);
    const roadmap = this.buildBacklogRoadmap(scoredItems, staleItems, {
      candidateLimit,
      nextCycleCapacity,
    });

    return {
      generatedAt: now.toISOString(),
      policy: {
        staleAfterDays,
        candidateLimit,
        nextCycleCapacity,
        writesPerformed: false,
      },
      sources: {
        linear: linearSnapshot
          ? {
              team: linearSnapshot[0].team,
              issuesReturned: linearIssues.length,
              cyclesReturned: cycleContext.cycles.length,
            }
          : null,
        github: githubSnapshots.map((snapshot) => ({
          owner: snapshot.owner,
          repo: snapshot.repo,
          issuesReturned: snapshot.issues.length,
        })),
      },
      cycleContext: {
        activeCycle: cycleContext.activeCycle,
        nextCycle: cycleContext.nextCycle,
        previousCycle: cycleContext.previousCycle,
      },
      summary: {
        totalItems: workItems.length,
        openItems: openItems.length,
        staleItems: staleItems.length,
        nextCycleCandidates: nextCycleCandidates.length,
        previousCycleCarryOver: this.previousCycleCarryOver(openItems, cycleContext).length,
        governanceGaps: scoredItems.filter((item) => item.governanceGaps.length > 0).length,
      },
      nextCycleCandidates: nextCycleCandidates.slice(0, candidateLimit),
      staleItems: staleItems.slice(0, candidateLimit),
      outcomeRoadmap: roadmap,
      portfolioReview: this.portfolioReview(openItems),
      governanceGaps: this.backlogGovernanceGaps(scoredItems).slice(0, candidateLimit),
      lastCycleReview: this.lastCycleReview(workItems, cycleContext),
    };
  }

  async createProactiveIssues(input: ProductEngineCreateInput) {
    const mode = input.mode ?? "plan";
    const confidenceThreshold = clampRatio(
      input.confidenceThreshold,
      this.config.signalConfidenceThreshold,
    );
    const maxCreate = clampInteger(input.maxCreate, 5, 25);
    const evaluations = input.signals.map((signal) =>
      this.vetSignal(signal, confidenceThreshold),
    );
    const qualified = evaluations.filter((evaluation) => evaluation.qualified).slice(0, maxCreate);
    const created: unknown[] = [];

    if (mode === "create-github" && !this.githubService) {
      throw new Error("GitHub App is not configured. Set GITHUB_APP_* before creating GitHub issues.");
    }

    for (const evaluation of qualified) {
      if (mode === "plan") {
        continue;
      }

      const signal = evaluation.signal;
      const body = formatIssueBody(signal);
      if (mode === "create-linear") {
        const target = {
          ...input.defaultLinear,
          ...signal.target?.linear,
        };
        const createdIssue = await this.linearService.createIssueFromTemplate({
          title: signal.title,
          templateKey: target.templateKey ?? "product-opportunity",
          teamId: target.teamId,
          description: body,
          priority: target.priority ?? priorityFromSeverity(signal.severity),
          labelIds: target.labelIds,
          assigneeId: target.assigneeId,
          stateId: target.stateId,
          projectId: target.projectId,
          autofillMissingSections: true,
        });
        created.push({
          signalTitle: signal.title,
          target: "linear",
          result: createdIssue,
        });
      }

      if (mode === "create-github") {
        const target = {
          ...input.defaultGitHub,
          ...signal.target?.github,
        };
        if (!target.repo?.trim()) {
          throw new Error(
            `GitHub repo is required for signal '${signal.title}'. Pass signal.target.github.repo or defaultGitHub.repo.`,
          );
        }

        const createdIssue = await this.githubService!.createIssueFromTemplate({
          owner: target.owner,
          repo: target.repo,
          title: signal.title,
          templateKey: target.templateKey ?? "issue-product-opportunity",
          body,
          labels: target.labels,
          assignees: target.assignees,
          milestone: target.milestone,
          autofillMissingSections: true,
        });
        created.push({
          signalTitle: signal.title,
          target: "github",
          result: createdIssue,
        });
      }
    }

    return {
      mode,
      confidenceThreshold,
      maxCreate,
      writesPerformed: mode !== "plan",
      evaluated: evaluations.map((evaluation) => ({
        title: evaluation.signal.title,
        qualified: evaluation.qualified,
        score: evaluation.score,
        reasons: evaluation.reasons,
        plannedBody: evaluation.qualified ? formatIssueBody(evaluation.signal) : undefined,
      })),
      created,
    };
  }

  scoreInitiatives(input: ProductEngineScoreInput) {
    const method = input.method ?? "rice";
    const capacity = clampInteger(input.capacity, 10, 100);
    const nowLimit = clampInteger(input.nowLimit, Math.min(5, capacity), capacity);
    const nextLimit = clampInteger(input.nextLimit, Math.min(10, capacity), capacity);
    const portfolioTarget = {
      core: input.portfolioTarget?.core ?? 0.7,
      adjacent: input.portfolioTarget?.adjacent ?? 0.2,
      transformational: input.portfolioTarget?.transformational ?? 0.1,
    };
    const scored = input.initiatives
      .map((initiative) => this.scoreInitiative(initiative, method))
      .sort((left, right) => right.score - left.score);
    const park = scored.filter(
      (initiative) =>
        initiative.governanceGaps.includes("weak evidence") ||
        initiative.governanceGaps.includes("missing outcome") ||
        initiative.governanceGaps.includes("missing kill criteria"),
    );
    const active = scored.filter((initiative) => !park.includes(initiative));
    const now = active.slice(0, nowLimit);
    const next = active.slice(nowLimit, nowLimit + nextLimit);
    const later = active.slice(nowLimit + nextLimit);

    return {
      method,
      policy: {
        capacity,
        nowLimit,
        nextLimit,
        portfolioTarget,
        writesPerformed: false,
      },
      rankedInitiatives: scored,
      outcomeRoadmap: {
        now: now.map((initiative) => this.toRoadmapItem(initiative, "now")),
        next: next.map((initiative) => this.toRoadmapItem(initiative, "next")),
        later: later.map((initiative) => this.toRoadmapItem(initiative, "later")),
        park: park.map((initiative) => this.toRoadmapItem(initiative, "park")),
      },
      portfolioReview: this.initiativePortfolioReview(scored, portfolioTarget),
      governanceGaps: scored
        .filter((initiative) => initiative.governanceGaps.length > 0)
        .map((initiative) => ({
          title: initiative.title,
          gaps: initiative.governanceGaps,
          recommendation: "Fill these before committing roadmap capacity.",
        })),
    };
  }

  private fromLinearIssue(issue: LinearIssueInventoryItem, now: Date): NormalizedWorkItem {
    const closedAt = issue.completedAt ?? issue.canceledAt ?? issue.archivedAt;
    return {
      source: "linear",
      id: issue.id,
      key: issue.identifier,
      title: issue.title,
      url: issue.url,
      body: issue.description,
      state: closedAt ? "closed" : "open",
      labels: issue.labelIds.map((labelId) => `label:${labelId}`),
      assignees: issue.assigneeId ? [issue.assigneeId] : [],
      portfolioBucket: classifyPortfolioBucket([
        issue.title,
        issue.description ?? "",
        ...issue.labelIds,
      ]),
      priority: issue.priority,
      priorityLabel: issue.priorityLabel,
      sourceTeamId: issue.teamId,
      cycleId: issue.cycleId,
      projectId: issue.projectId,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt,
      staleDays: daysSince(issue.updatedAt, now),
      isClosed: Boolean(closedAt),
    };
  }

  private fromGitHubIssue(
    issue: GitHubIssueInventoryItem,
    owner: string,
    repo: string,
    now: Date,
  ): NormalizedWorkItem {
    return {
      source: "github",
      id: String(issue.id),
      key: `${owner}/${repo}#${issue.number}`,
      title: issue.title,
      url: issue.url,
      body: issue.body,
      state: issue.state,
      labels: issue.labels,
      assignees: issue.assignees,
      portfolioBucket: classifyPortfolioBucket([issue.title, issue.body ?? "", ...issue.labels]),
      sourceOwner: owner,
      sourceRepo: repo,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt: issue.closedAt,
      staleDays: daysSince(issue.updatedAt, now),
      isClosed: issue.state === "closed" || Boolean(issue.closedAt),
    };
  }

  private buildCycleContext(cycles: LinearCycleInventoryItem[]): CycleContext {
    const byStart = [...cycles].sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );
    const byEndDescending = [...cycles].sort(
      (left, right) => Date.parse(right.endsAt) - Date.parse(left.endsAt),
    );

    return {
      activeCycle: cycles.find((cycle) => cycle.isActive),
      nextCycle: cycles.find((cycle) => cycle.isNext) ?? byStart.find((cycle) => cycle.isFuture),
      previousCycle:
        cycles.find((cycle) => cycle.isPrevious) ??
        byEndDescending.find((cycle) => cycle.isPast || Boolean(cycle.completedAt)),
      cycles,
    };
  }

  private scoreWorkItem(
    item: NormalizedWorkItem,
    context: {
      staleAfterDays: number;
      nextCycle?: LinearCycleInventoryItem;
      previousCycle?: LinearCycleInventoryItem;
    },
  ): ScoredWorkItem {
    const reasons: string[] = [];
    const governanceGaps = this.workItemGovernanceGaps(item);
    let score = item.source === "linear" ? linearPriorityScore(item.priority) : 45;

    if (containsAny(item.labels, ["urgent", "blocker", "security", "incident", "regression"])) {
      score += 25;
      reasons.push("high-impact label detected");
    }

    if (containsAny(item.labels, ["customer", "revenue", "enterprise", "support"])) {
      score += 15;
      reasons.push("customer or revenue signal detected");
    }

    if (context.previousCycle && item.cycleId === context.previousCycle.id) {
      score += 35;
      reasons.push("unfinished from previous cycle");
    }

    if (context.nextCycle && item.cycleId === context.nextCycle.id) {
      score += 20;
      reasons.push("already assigned to next cycle");
    }

    if (item.assignees.length === 0) {
      score += 6;
      reasons.push("needs an owner");
    }

    if (item.staleDays >= context.staleAfterDays) {
      score -= 18;
      reasons.push(`stale for ${item.staleDays} days`);
    }

    if (reasons.length === 0) {
      reasons.push("ranked by priority and update recency");
    }

    const recommendedAction =
      item.staleDays >= context.staleAfterDays
        ? "Vet before planning: recommit, split, or close stale work."
        : "Candidate for next-cycle planning.";

    return {
      ...item,
      score: Math.max(Math.round(score), 0),
      reasons,
      recommendedAction,
      governanceGaps,
    };
  }

  private previousCycleCarryOver(
    openItems: NormalizedWorkItem[],
    cycleContext: CycleContext,
  ): NormalizedWorkItem[] {
    if (!cycleContext.previousCycle) {
      return [];
    }

    return openItems.filter((item) => item.cycleId === cycleContext.previousCycle?.id);
  }

  private lastCycleReview(items: NormalizedWorkItem[], cycleContext: CycleContext) {
    if (!cycleContext.previousCycle) {
      return null;
    }

    const scopedItems = items.filter((item) => item.cycleId === cycleContext.previousCycle?.id);
    const completed = scopedItems.filter((item) => item.isClosed);
    const unresolved = scopedItems.filter((item) => !item.isClosed);

    return {
      cycle: cycleContext.previousCycle,
      totalScopedItems: scopedItems.length,
      completedItems: completed.length,
      unresolvedItems: unresolved.length,
      completionRate:
        scopedItems.length > 0 ? Number((completed.length / scopedItems.length).toFixed(2)) : null,
      carryOverCandidates: unresolved.map((item) => ({
        ...item,
        recommendedAction: "Carry over only if still aligned with the next cycle goal.",
      })),
    };
  }

  private buildBacklogRoadmap(
    scoredItems: ScoredWorkItem[],
    staleItems: ScoredWorkItem[],
    limits: {
      candidateLimit: number;
      nextCycleCapacity: number;
    },
  ) {
    const stableCandidates = scoredItems.filter(
      (item) => !staleItems.some((stale) => stale.id === item.id && stale.source === item.source),
    );
    const now = stableCandidates.slice(0, Math.min(3, limits.nextCycleCapacity));
    const next = stableCandidates.slice(now.length, limits.nextCycleCapacity);
    const later = stableCandidates.slice(limits.nextCycleCapacity, limits.nextCycleCapacity + limits.candidateLimit);

    return {
      now: now.map((item) => ({
        ...item,
        roadmapHorizon: "now" as const,
        outcome: "Prioritized by live priority, labels, ownership, and cycle context.",
      })),
      next: next.map((item) => ({
        ...item,
        roadmapHorizon: "next" as const,
        outcome: "Keep as next-cycle candidate pending explicit outcome metric and capacity.",
      })),
      later: later.map((item) => ({
        ...item,
        roadmapHorizon: "later" as const,
        outcome: "Keep visible, but do not commit until evidence or urgency improves.",
      })),
      needsDecision: staleItems.slice(0, limits.candidateLimit).map((item) => ({
        ...item,
        roadmapHorizon: "park" as const,
        outcome: "Decision required: recommit, split, or close stale work.",
      })),
    };
  }

  private portfolioReview(items: NormalizedWorkItem[]) {
    const counts = {
      core: items.filter((item) => item.portfolioBucket === "core").length,
      adjacent: items.filter((item) => item.portfolioBucket === "adjacent").length,
      transformational: items.filter((item) => item.portfolioBucket === "transformational").length,
    };
    const total = items.length || 1;

    return {
      target: {
        core: 0.7,
        adjacent: 0.2,
        transformational: 0.1,
      },
      actual: {
        core: Number((counts.core / total).toFixed(2)),
        adjacent: Number((counts.adjacent / total).toFixed(2)),
        transformational: Number((counts.transformational / total).toFixed(2)),
      },
      counts,
      recommendation:
        items.length === 0
          ? "No open portfolio items found."
          : "Use this as a heuristic only; adjust the 70/20/10 mix to match strategy and constraints.",
    };
  }

  private initiativePortfolioReview(
    initiatives: Array<ProductInitiativeInput & { score: number; governanceGaps: string[] }>,
    target: Record<PortfolioBucket, number>,
  ) {
    const total = initiatives.length || 1;
    const counts = {
      core: initiatives.filter((initiative) => (initiative.portfolioBucket ?? "core") === "core")
        .length,
      adjacent: initiatives.filter((initiative) => initiative.portfolioBucket === "adjacent").length,
      transformational: initiatives.filter(
        (initiative) => initiative.portfolioBucket === "transformational",
      ).length,
    };

    return {
      target,
      actual: {
        core: Number((counts.core / total).toFixed(2)),
        adjacent: Number((counts.adjacent / total).toFixed(2)),
        transformational: Number((counts.transformational / total).toFixed(2)),
      },
      counts,
      recommendation: "Review concentration risk before locking the roadmap.",
    };
  }

  private backlogGovernanceGaps(items: ScoredWorkItem[]) {
    return items
      .filter((item) => item.governanceGaps.length > 0)
      .map((item) => ({
        key: item.key,
        title: item.title,
        url: item.url,
        gaps: item.governanceGaps,
        recommendation: "Add outcome metrics, guardrails, and kill criteria before commitment.",
      }));
  }

  private workItemGovernanceGaps(item: NormalizedWorkItem): string[] {
    const text = `${item.title}\n${item.body ?? ""}`.toLowerCase();
    const gaps: string[] = [];

    if (!text.includes("formula") && !text.includes("metric")) {
      gaps.push("missing defined outcome metric");
    }

    if (!text.includes("guardrail")) {
      gaps.push("missing guardrails");
    }

    if (!text.includes("kill criteria") && !text.includes("stop condition")) {
      gaps.push("missing kill criteria");
    }

    if (!text.includes("what would change my mind")) {
      gaps.push("missing decision reversal criteria");
    }

    return gaps;
  }

  private scoreInitiative(initiative: ProductInitiativeInput, method: PrioritizationMethod) {
    const confidence = clampRatio(initiative.confidence, 0.5);
    const reach = Math.max(initiative.reach ?? 1, 0);
    const impact = Math.max(initiative.impact ?? 1, 0);
    const effort = Math.max(initiative.effort ?? 1, 0.25);
    const ease = Math.max(initiative.ease ?? 1, 0);
    const importance = Math.max(initiative.importance ?? impact, 0);
    const satisfaction = Math.max(initiative.satisfaction ?? 0, 0);
    const costOfDelay = Math.max(initiative.costOfDelay ?? impact, 0);
    const duration = Math.max(initiative.duration ?? effort, 0.25);
    const governanceGaps = this.initiativeGovernanceGaps(initiative);
    let score: number;

    switch (method) {
      case "ice":
        score = impact * confidence * ease;
        break;
      case "wsjf":
        score = costOfDelay / duration;
        break;
      case "opportunity":
        score = importance * Math.max(importance - satisfaction, 0);
        break;
      case "rice":
      default:
        score = (reach * impact * confidence) / effort;
        break;
    }

    const evidenceAdjustment = evidenceQualityScore(initiative.evidenceQuality);
    const adjustedScore = Math.max(Number((score + evidenceAdjustment).toFixed(2)), 0);

    return {
      ...initiative,
      score: adjustedScore,
      method,
      portfolioBucket: initiative.portfolioBucket ?? "core",
      governanceGaps,
      recommendedAction:
        governanceGaps.length > 0
          ? "De-risk before commitment."
          : "Eligible for roadmap commitment if capacity and portfolio mix fit.",
    };
  }

  private initiativeGovernanceGaps(initiative: ProductInitiativeInput): string[] {
    const gaps: string[] = [];

    if (!hasText(initiative.outcome)) {
      gaps.push("missing outcome");
    }

    if (!hasText(initiative.evidence)) {
      gaps.push("missing evidence");
    }

    if (initiative.evidenceQuality === "weak") {
      gaps.push("weak evidence");
    }

    if (!hasText(initiative.whatWouldChangeMind)) {
      gaps.push("missing what would change my mind");
    }

    if (!initiative.metrics || !initiative.metrics.some((metric) => metricIsDefined(metric))) {
      gaps.push("missing defined success metric");
    }

    if (!initiative.guardrails || !initiative.guardrails.some((metric) => metricIsDefined(metric))) {
      gaps.push("missing guardrail metric");
    }

    if (!initiative.killCriteria || initiative.killCriteria.length === 0) {
      gaps.push("missing kill criteria");
    }

    if (
      !hasText(initiative.requirements?.privacy) ||
      !hasText(initiative.requirements?.security) ||
      !hasText(initiative.requirements?.accessibility)
    ) {
      gaps.push("missing privacy/security/accessibility checklist");
    }

    return gaps;
  }

  private toRoadmapItem(
    initiative: ProductInitiativeInput & { score: number; governanceGaps: string[] },
    horizon: RoadmapHorizon,
  ) {
    return {
      title: initiative.title,
      outcome: initiative.outcome ?? "_Define outcome before commitment._",
      horizon,
      score: initiative.score,
      portfolioBucket: initiative.portfolioBucket ?? "core",
      owner: initiative.owner,
      metrics: initiative.metrics ?? [],
      guardrails: initiative.guardrails ?? [],
      killCriteria: initiative.killCriteria ?? [],
      governanceGaps: initiative.governanceGaps,
    };
  }

  private vetSignal(signal: ProductSignalInput, confidenceThreshold: number) {
    const reasons: string[] = [];
    const confidence = clampRatio(signal.confidence, 0.5);
    let score = Math.round(
      confidence * 60 + severityScore(signal.severity) + evidenceQualityScore(signal.evidenceQuality),
    );
    let qualified = true;

    if (!signal.title?.trim()) {
      qualified = false;
      reasons.push("missing title");
    }

    if (!signal.evidence?.trim() || signal.evidence.trim().length < 10) {
      qualified = false;
      reasons.push("evidence is missing or too thin");
    }

    if (signal.evidenceQuality === "weak") {
      qualified = false;
      reasons.push("weak evidence must be strengthened before issue creation");
    }

    if (!signal.evidenceQuality) {
      reasons.push("evidence quality is unclassified");
    }

    if (confidence < confidenceThreshold) {
      qualified = false;
      reasons.push(`confidence ${confidence} is below threshold ${confidenceThreshold}`);
    }

    if (!signal.impact?.trim() && !signal.recommendation?.trim()) {
      qualified = false;
      reasons.push("needs impact or recommendation before issue creation");
    }

    if (!metricIsDefined(signal.outcomeMetric)) {
      qualified = false;
      reasons.push("outcome metric must include name, formula, timeframe, and data source");
    }

    if (!signal.guardrailMetrics || !signal.guardrailMetrics.some((metric) => metricIsDefined(metric))) {
      qualified = false;
      reasons.push("at least one guardrail metric is required");
    }

    if (!signal.killCriteria || signal.killCriteria.length === 0) {
      qualified = false;
      reasons.push("kill criteria are required before proactive creation");
    }

    if (!signal.whatWouldChangeMind?.trim()) {
      qualified = false;
      reasons.push("whatWouldChangeMind is required");
    }

    if (
      !signal.requirements?.privacy?.trim() ||
      !signal.requirements.security?.trim() ||
      !signal.requirements.accessibility?.trim()
    ) {
      qualified = false;
      reasons.push("privacy, security, and accessibility requirements are required");
    }

    if (signal.tags && containsAny(signal.tags, ["customer", "revenue", "security", "incident"])) {
      score += 12;
      reasons.push("strategic tag detected");
    }

    if (qualified) {
      reasons.push("signal has enough evidence and confidence for governed creation");
    }

    return {
      signal,
      qualified,
      score,
      reasons,
    };
  }
}
