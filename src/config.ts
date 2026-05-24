import "dotenv/config";

import {
  BUILTIN_TEMPLATES,
  mergeTemplates,
  normalizeTemplateKey,
  type TemplateCollection,
  type TemplateOverrideCollection,
} from "./templates.js";

export interface ServerConfig {
  apiKey: string;
  defaultTeamId?: string;
  defaultTemplate?: string;
  templateStrictMode: boolean;
  templates: TemplateCollection;
  serverName: string;
  serverVersion: string;
}

function parseBoolean(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (rawValue === undefined || rawValue.trim() === "") {
    return defaultValue;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(
    `Invalid boolean value '${rawValue}' for TEMPLATE_STRICT_MODE. Use true/false.`,
  );
}

function parseTemplateOverrides(
  overridesRaw: string | undefined,
): TemplateOverrideCollection {
  if (!overridesRaw || overridesRaw.trim() === "") {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(overridesRaw);
  } catch (error) {
    throw new Error(
      `LINEAR_TEMPLATE_OVERRIDES_JSON is not valid JSON: ${(error as Error).message}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LINEAR_TEMPLATE_OVERRIDES_JSON must be a JSON object.");
  }

  return parsed as TemplateOverrideCollection;
}

export function loadConfig(): ServerConfig {
  const apiKey = process.env.LINEAR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY is required.");
  }

  const defaultTeamId = process.env.LINEAR_DEFAULT_TEAM_ID?.trim() || undefined;
  const rawDefaultTemplate = process.env.LINEAR_DEFAULT_TEMPLATE?.trim() || undefined;
  const templateStrictMode = parseBoolean(process.env.TEMPLATE_STRICT_MODE, true);
  const templateOverrides = parseTemplateOverrides(process.env.LINEAR_TEMPLATE_OVERRIDES_JSON);
  const templates = mergeTemplates(BUILTIN_TEMPLATES, templateOverrides);
  const defaultTemplate = rawDefaultTemplate
    ? normalizeTemplateKey(rawDefaultTemplate)
    : undefined;

  if (defaultTemplate && !templates[defaultTemplate]) {
    throw new Error(
      `LINEAR_DEFAULT_TEMPLATE '${defaultTemplate}' does not match any configured template.`,
    );
  }

  return {
    apiKey,
    defaultTeamId,
    defaultTemplate,
    templateStrictMode,
    templates,
    serverName: process.env.SERVER_NAME?.trim() || "linear-management-mcp",
    serverVersion: process.env.SERVER_VERSION?.trim() || "0.1.0",
  };
}

