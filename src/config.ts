import "dotenv/config";

import {
  BUILTIN_GITHUB_TEMPLATES,
  mergeGitHubTemplates,
  normalizeGitHubTemplateKey,
  type GitHubTemplateCollection,
  type GitHubTemplateOverrideCollection,
} from "./github-templates.js";
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
  github?: GitHubAppConfig;
  serverName: string;
  serverVersion: string;
}

export interface GitHubAppConfig {
  appId: number;
  owner: string;
  privateKey: string;
  apiBaseUrl?: string;
  defaultTemplate?: string;
  templateStrictMode: boolean;
  templates: GitHubTemplateCollection;
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

function parseGitHubTemplateOverrides(
  overridesRaw: string | undefined,
): GitHubTemplateOverrideCollection {
  if (!overridesRaw || overridesRaw.trim() === "") {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(overridesRaw);
  } catch (error) {
    throw new Error(
      `GITHUB_TEMPLATE_OVERRIDES_JSON is not valid JSON: ${(error as Error).message}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("GITHUB_TEMPLATE_OVERRIDES_JSON must be a JSON object.");
  }

  return parsed as GitHubTemplateOverrideCollection;
}

function parseGitHubAppConfig(): GitHubAppConfig | undefined {
  const rawAppId = process.env.GITHUB_APP_ID?.trim();
  const owner = process.env.GITHUB_APP_OWNER?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();

  const hasAnyValue = Boolean(rawAppId || owner || privateKey);
  if (!hasAnyValue) {
    return undefined;
  }

  if (!rawAppId) {
    throw new Error("GITHUB_APP_ID is required when GitHub App auth is configured.");
  }

  if (!owner) {
    throw new Error("GITHUB_APP_OWNER is required when GitHub App auth is configured.");
  }

  if (!privateKey) {
    throw new Error("GITHUB_APP_PRIVATE_KEY is required when GitHub App auth is configured.");
  }

  const appId = Number.parseInt(rawAppId, 10);
  if (!Number.isFinite(appId) || appId <= 0) {
    throw new Error(`GITHUB_APP_ID must be a positive integer. Received '${rawAppId}'.`);
  }

  const templates = mergeGitHubTemplates(
    BUILTIN_GITHUB_TEMPLATES,
    parseGitHubTemplateOverrides(process.env.GITHUB_TEMPLATE_OVERRIDES_JSON),
  );
  const rawDefaultTemplate = process.env.GITHUB_DEFAULT_TEMPLATE?.trim();
  const defaultTemplate = rawDefaultTemplate
    ? normalizeGitHubTemplateKey(rawDefaultTemplate)
    : undefined;
  if (defaultTemplate && !templates[defaultTemplate]) {
    throw new Error(
      `GITHUB_DEFAULT_TEMPLATE '${defaultTemplate}' does not match any configured GitHub template.`,
    );
  }

  return {
    appId,
    owner,
    privateKey,
    apiBaseUrl: process.env.GITHUB_API_BASE_URL?.trim() || undefined,
    defaultTemplate,
    templateStrictMode: parseBoolean(process.env.GITHUB_TEMPLATE_STRICT_MODE, true),
    templates,
  };
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
  const github = parseGitHubAppConfig();
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
    github,
    serverName: process.env.SERVER_NAME?.trim() || "linear-management-mcp",
    serverVersion: process.env.SERVER_VERSION?.trim() || "0.1.0",
  };
}
