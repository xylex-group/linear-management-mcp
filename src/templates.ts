export interface IssueTemplate {
  key: string;
  displayName: string;
  description: string;
  titlePrefix: string;
  requiredSections: string[];
  optionalSections: string[];
}

export interface IssueTemplateOverride {
  displayName?: string;
  description?: string;
  titlePrefix?: string;
  requiredSections?: string[];
  optionalSections?: string[];
}

export type TemplateCollection = Record<string, IssueTemplate>;
export type TemplateOverrideCollection = Record<string, IssueTemplateOverride>;

export const BUILTIN_TEMPLATES: TemplateCollection = {
  bug: {
    key: "bug",
    displayName: "Bug Report",
    description: "Capture reproducible defects with concrete impact details.",
    titlePrefix: "[Bug]",
    requiredSections: [
      "Summary",
      "Steps To Reproduce",
      "Expected Behavior",
      "Actual Behavior",
      "Impact",
    ],
    optionalSections: ["Environment", "Logs", "Screenshots"],
  },
  "feature-request": {
    key: "feature-request",
    displayName: "Feature Request",
    description: "Describe requested capability, value, and delivery scope.",
    titlePrefix: "[Feature]",
    requiredSections: [
      "Problem Statement",
      "Desired Outcome",
      "Scope",
      "Acceptance Criteria",
    ],
    optionalSections: ["Out Of Scope", "Dependencies", "Rollout Notes"],
  },
  "engineering-task": {
    key: "engineering-task",
    displayName: "Engineering Task",
    description: "Track implementation work with explicit technical boundaries.",
    titlePrefix: "[Task]",
    requiredSections: [
      "Context",
      "Implementation Plan",
      "Validation",
      "Definition Of Done",
    ],
    optionalSections: ["Risks", "References"],
  },
  "product-opportunity": {
    key: "product-opportunity",
    displayName: "Product Opportunity",
    description: "Capture governed product signals before they become planned work.",
    titlePrefix: "[Opportunity]",
    requiredSections: [
      "Signal",
      "Customer/User Impact",
      "Proposed Outcome",
      "Evidence",
      "Acceptance Criteria",
    ],
    optionalSections: ["Risk And Dependencies", "Cycle Fit", "References"],
  },
};

export function normalizeTemplateKey(key: string): string {
  return key.trim().toLowerCase();
}

function dedupeSections(sections: string[] | undefined): string[] {
  if (!sections || sections.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

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
    result.push(section);
  }

  return result;
}

export function mergeTemplates(
  base: TemplateCollection,
  overrides: TemplateOverrideCollection,
): TemplateCollection {
  const merged: TemplateCollection = Object.fromEntries(
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
    const key = normalizeTemplateKey(rawKey);
    const baseTemplate = merged[key];
    const fallbackLabel = key
      .split("-")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");

    const requiredSections = dedupeSections(override.requiredSections);
    const optionalSections = dedupeSections(override.optionalSections);

    const template: IssueTemplate = {
      key,
      displayName: override.displayName ?? baseTemplate?.displayName ?? fallbackLabel,
      description:
        override.description ??
        baseTemplate?.description ??
        "Custom template loaded from LINEAR_TEMPLATE_OVERRIDES_JSON.",
      titlePrefix: override.titlePrefix ?? baseTemplate?.titlePrefix ?? "[Task]",
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
        `Template '${key}' must define at least one required section in LINEAR_TEMPLATE_OVERRIDES_JSON.`,
      );
    }

    merged[key] = template;
  }

  return merged;
}
