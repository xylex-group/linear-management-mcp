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

export interface ProductSignalInput {
  title: string;
  source?: string;
  evidence: string;
  impact?: string;
  recommendation?: string;
  acceptanceCriteria?: string[];
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

interface NormalizedWorkItem {
  source: IssueSource;
  id: string;
  key: string;
  title: string;
  url: string;
  state: string;
  labels: string[];
  assignees: string[];
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

  return [
    `## Signal\n${signal.source ? `Source: ${signal.source}\n\n` : ""}${signal.title}`,
    `## Customer/User Impact\n${signal.impact?.trim() || "_TODO: describe product impact._"}`,
    `## Proposed Outcome\n${
      signal.recommendation?.trim() || "_TODO: describe the intended product outcome._"
    }`,
    `## Evidence\n${signal.evidence.trim()}`,
    `## Acceptance Criteria\n${criteria}`,
    `## Risk And Dependencies\nSeverity: ${signal.severity ?? "medium"}\nConfidence: ${
      signal.confidence ?? "not provided"
    }\nTags: ${tags}`,
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
      },
      nextCycleCandidates: nextCycleCandidates.slice(0, candidateLimit),
      staleItems: staleItems.slice(0, candidateLimit),
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

  private fromLinearIssue(issue: LinearIssueInventoryItem, now: Date): NormalizedWorkItem {
    const closedAt = issue.completedAt ?? issue.canceledAt ?? issue.archivedAt;
    return {
      source: "linear",
      id: issue.id,
      key: issue.identifier,
      title: issue.title,
      url: issue.url,
      state: closedAt ? "closed" : "open",
      labels: issue.labelIds.map((labelId) => `label:${labelId}`),
      assignees: issue.assigneeId ? [issue.assigneeId] : [],
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
      state: issue.state,
      labels: issue.labels,
      assignees: issue.assignees,
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

  private vetSignal(signal: ProductSignalInput, confidenceThreshold: number) {
    const reasons: string[] = [];
    const confidence = clampRatio(signal.confidence, 0.5);
    let score = Math.round(confidence * 60 + severityScore(signal.severity));
    let qualified = true;

    if (!signal.title?.trim()) {
      qualified = false;
      reasons.push("missing title");
    }

    if (!signal.evidence?.trim() || signal.evidence.trim().length < 10) {
      qualified = false;
      reasons.push("evidence is missing or too thin");
    }

    if (confidence < confidenceThreshold) {
      qualified = false;
      reasons.push(`confidence ${confidence} is below threshold ${confidenceThreshold}`);
    }

    if (!signal.impact?.trim() && !signal.recommendation?.trim()) {
      qualified = false;
      reasons.push("needs impact or recommendation before issue creation");
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
