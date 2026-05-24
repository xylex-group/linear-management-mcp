export interface GitHubBodyTemplate {
  key: string;
  displayName: string;
  description: string;
  requiredSections: string[];
  optionalSections: string[];
}

export interface GitHubTemplateOverride {
  displayName?: string;
  description?: string;
  requiredSections?: string[];
  optionalSections?: string[];
}

export type GitHubTemplateCollection = Record<string, GitHubBodyTemplate>;
export type GitHubTemplateOverrideCollection = Record<string, GitHubTemplateOverride>;

export const BUILTIN_GITHUB_TEMPLATES: GitHubTemplateCollection = {
  "issue-bug": {
    key: "issue-bug",
    displayName: "GitHub Issue Bug",
    description: "Track a reproducible defect in a repository.",
    requiredSections: [
      "Summary",
      "Steps To Reproduce",
      "Expected Behavior",
      "Actual Behavior",
      "Impact",
    ],
    optionalSections: ["Environment", "Logs", "Screenshots"],
  },
  "issue-feature": {
    key: "issue-feature",
    displayName: "GitHub Issue Feature",
    description: "Capture a feature request with delivery acceptance.",
    requiredSections: [
      "Problem Statement",
      "Proposed Change",
      "Acceptance Criteria",
      "Validation",
    ],
    optionalSections: ["Dependencies", "Rollout Notes"],
  },
  "pull-request": {
    key: "pull-request",
    displayName: "Pull Request Template",
    description: "Describe implementation intent and validation for PRs.",
    requiredSections: ["Summary", "Changes", "Validation"],
    optionalSections: ["Risks", "Follow Ups"],
  },
};

export function normalizeGitHubTemplateKey(key: string): string {
  return key.trim().toLowerCase();
}

function dedupeSections(sections: string[] | undefined): string[] {
  if (!sections || sections.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of sections) {
    const section = raw.trim();
    if (!section) {
      continue;
    }

    const normalized = section.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(section);
  }

  return output;
}

export function mergeGitHubTemplates(
  base: GitHubTemplateCollection,
  overrides: GitHubTemplateOverrideCollection,
): GitHubTemplateCollection {
  const merged: GitHubTemplateCollection = Object.fromEntries(
    Object.entries(base).map(([key, template]) => [
      key,
      {
        ...template,
        requiredSections: [...template.requiredSections],
        optionalSections: [...template.optionalSections],
      },
    ]),
  );

  for (const [rawKey, override] of Object.entries(overrides)) {
    const key = normalizeGitHubTemplateKey(rawKey);
    const baseTemplate = merged[key];
    const fallbackName = key
      .split("-")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");

    const requiredSections = dedupeSections(override.requiredSections);
    const optionalSections = dedupeSections(override.optionalSections);

    const template: GitHubBodyTemplate = {
      key,
      displayName: override.displayName ?? baseTemplate?.displayName ?? fallbackName,
      description:
        override.description ??
        baseTemplate?.description ??
        "Custom GitHub template loaded from env overrides.",
      requiredSections:
        requiredSections.length > 0
          ? requiredSections
          : [...(baseTemplate?.requiredSections ?? [])],
      optionalSections:
        optionalSections.length > 0
          ? optionalSections
          : [...(baseTemplate?.optionalSections ?? [])],
    };

    if (template.requiredSections.length === 0) {
      throw new Error(
        `GitHub template '${key}' must define at least one required section in GITHUB_TEMPLATE_OVERRIDES_JSON.`,
      );
    }

    merged[key] = template;
  }

  return merged;
}

