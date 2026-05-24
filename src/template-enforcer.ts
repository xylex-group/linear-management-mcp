import type { IssueTemplate } from "./templates.js";

interface SectionBlock {
  heading: string;
  content: string;
}

export interface TemplateValidationResult {
  templateKey: string;
  valid: boolean;
  missingRequiredSections: string[];
  emptyRequiredSections: string[];
  unknownSections: string[];
}

function normalizeSectionKey(section: string): string {
  return section.trim().toLowerCase();
}

function extractSections(markdown: string): SectionBlock[] {
  const content = markdown.replace(/\r\n/g, "\n");
  const matches = [...content.matchAll(/^##\s+(.+?)\s*$/gm)];

  if (matches.length === 0) {
    return [];
  }

  const sections: SectionBlock[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const heading = current[1].trim();
    const sectionStart = current.index! + current[0].length;
    const sectionEnd = next?.index ?? content.length;
    const sectionBody = content.slice(sectionStart, sectionEnd).trim();

    sections.push({
      heading,
      content: sectionBody,
    });
  }

  return sections;
}

function sectionMap(sections: SectionBlock[]): Map<string, SectionBlock> {
  const map = new Map<string, SectionBlock>();
  for (const section of sections) {
    map.set(normalizeSectionKey(section.heading), section);
  }
  return map;
}

export function validateTemplateDescription(
  template: IssueTemplate,
  description: string,
): TemplateValidationResult {
  const sections = extractSections(description);
  const byKey = sectionMap(sections);

  const missingRequiredSections: string[] = [];
  const emptyRequiredSections: string[] = [];
  const knownSectionKeys = new Set<string>();

  for (const required of template.requiredSections) {
    const key = normalizeSectionKey(required);
    knownSectionKeys.add(key);

    const section = byKey.get(key);
    if (!section) {
      missingRequiredSections.push(required);
      continue;
    }

    if (!section.content.trim()) {
      emptyRequiredSections.push(required);
    }
  }

  for (const optional of template.optionalSections) {
    knownSectionKeys.add(normalizeSectionKey(optional));
  }

  const unknownSections = sections
    .filter((section) => !knownSectionKeys.has(normalizeSectionKey(section.heading)))
    .map((section) => section.heading);

  return {
    templateKey: template.key,
    valid: missingRequiredSections.length === 0 && emptyRequiredSections.length === 0,
    missingRequiredSections,
    emptyRequiredSections,
    unknownSections,
  };
}

function composeSection(heading: string, content: string): string {
  return `## ${heading}\n${content}`.trimEnd();
}

function ensureNonEmptyBody(body: string, fallback: string): string {
  const trimmed = body.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function buildTemplateSkeleton(template: IssueTemplate): string {
  const required = template.requiredSections.map((section) =>
    composeSection(section, "_TODO: fill this section._"),
  );
  const optional = template.optionalSections.map((section) =>
    composeSection(section, "_Optional._"),
  );

  return [...required, ...optional].join("\n\n");
}

export function normalizeDescriptionToTemplate(
  template: IssueTemplate,
  description: string,
): string {
  const parsedSections = extractSections(description);
  const byKey = sectionMap(parsedSections);

  const renderedSections: string[] = [];
  const knownSectionKeys = new Set<string>();

  for (const required of template.requiredSections) {
    const key = normalizeSectionKey(required);
    knownSectionKeys.add(key);
    const match = byKey.get(key);
    const content = ensureNonEmptyBody(match?.content ?? "", "_TODO: fill this section._");
    renderedSections.push(composeSection(required, content));
  }

  for (const optional of template.optionalSections) {
    const key = normalizeSectionKey(optional);
    knownSectionKeys.add(key);
    const match = byKey.get(key);
    const content = ensureNonEmptyBody(match?.content ?? "", "_Optional._");
    renderedSections.push(composeSection(optional, content));
  }

  const extraSections = parsedSections
    .filter((section) => !knownSectionKeys.has(normalizeSectionKey(section.heading)))
    .map((section) => composeSection(section.heading, ensureNonEmptyBody(section.content, "_Notes._")));

  return [...renderedSections, ...extraSections].join("\n\n").trim();
}

