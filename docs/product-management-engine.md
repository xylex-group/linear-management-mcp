# Product Management Engine

The product engine turns this MCP server into a planning and governance layer over Linear and GitHub. It does not blindly create work. It gathers live issue inventory, scores what should be considered for the next cycle, flags stale work, and gates proactive issue creation behind evidence and confidence checks.

## Tools

### `product_engine_analyze_backlog`

Reads Linear team inventory and optional GitHub repositories, then returns:

- `cycleContext`: active, next, and previous Linear cycles
- `nextCycleCandidates`: ranked open work with score, reasons, and recommended action
- `staleItems`: open work with no updates after the configured stale threshold
- `lastCycleReview`: previous-cycle unresolved and completed work
- `outcomeRoadmap`: Now/Next/Later/Park-style planning slices
- `portfolioReview`: core/adjacent/transformational mix
- `governanceGaps`: items missing outcome metrics, guardrails, kill criteria, or decision reversal criteria

Example:

```json
{
  "linearTeamId": "team-uuid",
  "githubRepositories": [
    { "owner": "xylex-group", "repo": "linear-management-mcp" }
  ],
  "staleAfterDays": 14,
  "candidateLimit": 10,
  "nextCycleCapacity": 10
}
```

Scoring uses priority, carry-over from the previous cycle, next-cycle assignment, stale age, ownership, and high-signal labels such as `security`, `incident`, `customer`, and `revenue`. The output also classifies portfolio mix with a default 70% core / 20% adjacent / 10% transformational heuristic.

### `product_engine_create_proactive_issues`

Vets product signals and either returns a plan or creates issues.

Default mode is `plan`, which performs no writes:

```json
{
  "mode": "plan",
  "signals": [
    {
      "title": "Surface stale enterprise onboarding blockers",
      "source": "support-review",
      "evidence": "Four enterprise onboarding tickets mention the same stuck document upload step.",
      "evidenceQuality": "strong",
      "whatWouldChangeMind": "If fewer than two accounts reproduce this after the new uploader logs are enabled.",
      "impact": "Reduces time-to-value for new enterprise customers.",
      "recommendation": "Create a diagnostic checklist and stale-session recovery path.",
      "acceptanceCriteria": [
        "Support can identify stuck onboarding sessions",
        "Users can recover without restarting the whole flow"
      ],
      "outcomeMetric": {
        "name": "Enterprise onboarding recovery rate",
        "formula": "recovered stuck sessions / detected stuck sessions",
        "timeframe": "weekly",
        "dataSource": "onboarding events"
      },
      "guardrailMetrics": [
        {
          "name": "Upload support tickets",
          "formula": "count(upload-related support tickets)",
          "timeframe": "weekly",
          "dataSource": "support inbox"
        }
      ],
      "killCriteria": [
        {
          "type": "evidence",
          "condition": "Fewer than two enterprise accounts reproduce the stuck state",
          "deadline": "before implementation"
        }
      ],
      "requirements": {
        "privacy": "Only use account-level aggregate onboarding state.",
        "security": "Do not expose raw upload payloads in diagnostics.",
        "accessibility": "Recovery UI must be keyboard accessible."
      },
      "confidence": 0.82,
      "severity": "high",
      "portfolioBucket": "adjacent",
      "tags": ["customer", "enterprise"]
    }
  ]
}
```

To write Linear issues, set `mode` to `create-linear` and provide either `defaultLinear.teamId` or a per-signal `target.linear.teamId`. To write GitHub issues, set `mode` to `create-github` and provide either `defaultGitHub.repo` or per-signal `target.github.repo`.

## Governance Rules

A signal is rejected when:

- title is missing
- evidence is missing or too thin
- evidence quality is weak
- confidence is below `PRODUCT_ENGINE_SIGNAL_CONFIDENCE_THRESHOLD`
- both impact and recommendation are missing
- outcome metric lacks name, formula, timeframe, or data source
- guardrail metrics are missing
- kill criteria are missing
- `whatWouldChangeMind` is missing
- privacy, security, or accessibility notes are missing

Qualified signals are written with the `product-opportunity` Linear template or the `issue-product-opportunity` GitHub template unless a target overrides the template.

### `product_engine_score_initiatives`

Scores roadmap candidates before they become Linear or GitHub work.

Supported methods:

- `rice`: `(reach x impact x confidence) / effort`
- `ice`: `impact x confidence x ease`
- `wsjf`: `cost of delay / duration`
- `opportunity`: `importance x (importance - satisfaction)`

Example:

```json
{
  "method": "rice",
  "capacity": 10,
  "initiatives": [
    {
      "title": "Guided stale-work triage",
      "outcome": "Reduce stale issues older than 14 days by 30%",
      "evidence": "Backlog audit found repeated stale cycle carry-over.",
      "evidenceQuality": "medium",
      "whatWouldChangeMind": "If stale issue count is already below 5% for two cycles.",
      "reach": 30,
      "impact": 4,
      "confidence": 0.7,
      "effort": 3,
      "portfolioBucket": "core",
      "metrics": [
        {
          "name": "Stale issue rate",
          "formula": "stale open issues / open issues",
          "timeframe": "per cycle",
          "dataSource": "Linear issue inventory"
        }
      ],
      "guardrails": [
        {
          "name": "False close rate",
          "formula": "reopened stale issues / closed stale issues",
          "timeframe": "per cycle",
          "dataSource": "Linear issue history"
        }
      ],
      "killCriteria": [
        {
          "type": "usage",
          "condition": "Fewer than 20% of stale recommendations are acted on",
          "deadline": "after two cycles"
        }
      ],
      "requirements": {
        "privacy": "No customer content in scoring output.",
        "security": "Use existing API auth only.",
        "accessibility": "Generated issue content must be readable as plain markdown."
      }
    }
  ]
}
```

The result includes ranked initiatives, governance gaps, Now/Next/Later/Park roadmap slices, and portfolio mix against the target allocation.

## Environment Defaults

| Variable | Default | Purpose |
| --- | --- | --- |
| `PRODUCT_ENGINE_STALE_AFTER_DAYS` | `14` | Open work is stale after this many days without updates. |
| `PRODUCT_ENGINE_NEXT_CYCLE_CAPACITY` | `10` | Default number of next-cycle candidates to rank. |
| `PRODUCT_ENGINE_SIGNAL_CONFIDENCE_THRESHOLD` | `0.65` | Minimum confidence required for proactive issue creation. |
