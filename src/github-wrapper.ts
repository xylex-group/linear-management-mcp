import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

import {
  buildTemplateSkeleton,
  normalizeDescriptionToTemplate,
  validateTemplateDescription,
} from "./template-enforcer.js";
import {
  normalizeGitHubTemplateKey,
  type GitHubBodyTemplate,
  type GitHubTemplateCollection,
} from "./github-templates.js";
import type { IssueTemplate } from "./templates.js";

interface InstallationInfo {
  installationId: number;
  ownerLogin: string;
  targetType: string;
  repositorySelection: string;
}

export interface GitHubValidationInput {
  templateKey?: string;
  body: string;
}

export interface GitHubNormalizeInput {
  templateKey?: string;
  body: string;
}

export interface GitHubListRepositoriesInput {
  owner?: string;
  perPage?: number;
}

export interface GitHubCreateIssueInput {
  owner?: string;
  repo: string;
  title: string;
  templateKey?: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
  autofillMissingSections?: boolean;
}

export interface GitHubCreatePullRequestInput {
  owner?: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  templateKey?: string;
  body?: string;
  draft?: boolean;
  maintainerCanModify?: boolean;
  autofillMissingSections?: boolean;
}

export class GitHubAppService {
  private readonly appOctokit: Octokit;
  private readonly installationCache = new Map<string, InstallationInfo>();
  private readonly installationClientCache = new Map<number, Octokit>();

  constructor(
    private readonly appId: number,
    private readonly appOwner: string,
    private readonly privateKey: string,
    private readonly templates: GitHubTemplateCollection,
    private readonly templateStrictMode: boolean,
    private readonly defaultTemplate?: string,
    private readonly apiBaseUrl?: string,
  ) {
    this.appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey: this.normalizePrivateKey(privateKey),
      },
      baseUrl: apiBaseUrl,
    });
  }

  private normalizePrivateKey(key: string): string {
    return key.replace(/\\n/g, "\n");
  }

  private resolveOwner(owner?: string): string {
    const resolved = (owner ?? this.appOwner).trim();
    if (!resolved) {
      throw new Error(
        "GitHub owner is required. Pass owner explicitly or configure GITHUB_APP_OWNER.",
      );
    }

    return resolved;
  }

  private toIssueTemplate(template: GitHubBodyTemplate): IssueTemplate {
    return {
      key: template.key,
      displayName: template.displayName,
      description: template.description,
      titlePrefix: "",
      requiredSections: template.requiredSections,
      optionalSections: template.optionalSections,
    };
  }

  private resolveTemplate(templateKey?: string): GitHubBodyTemplate {
    const key = normalizeGitHubTemplateKey(
      templateKey ?? this.defaultTemplate ?? "issue-feature",
    );
    const template = this.templates[key];

    if (!template) {
      const available = Object.keys(this.templates).join(", ");
      throw new Error(`Unknown GitHub template '${key}'. Available templates: ${available}.`);
    }

    return template;
  }

  private async resolveInstallation(owner?: string): Promise<InstallationInfo> {
    const ownerLogin = this.resolveOwner(owner);
    const ownerKey = ownerLogin.toLowerCase();
    const cached = this.installationCache.get(ownerKey);
    if (cached) {
      return cached;
    }

    const installations = await this.appOctokit.paginate(
      this.appOctokit.rest.apps.listInstallations,
      { per_page: 100 },
    );
    const match = installations.find(
      (installation) => installation.account?.login?.toLowerCase() === ownerKey,
    );

    if (!match?.id || !match.account?.login) {
      const visibleOwners = installations
        .map((installation) => installation.account?.login)
        .filter((login): login is string => Boolean(login))
        .join(", ");
      throw new Error(
        `No GitHub App installation found for owner '${ownerLogin}'. Visible installations: ${
          visibleOwners || "(none)"
        }.`,
      );
    }

    const installationInfo: InstallationInfo = {
      installationId: match.id,
      ownerLogin: match.account.login,
      targetType: match.target_type,
      repositorySelection: match.repository_selection,
    };

    this.installationCache.set(ownerKey, installationInfo);
    return installationInfo;
  }

  private async installationOctokit(owner?: string): Promise<{
    ownerLogin: string;
    installationId: number;
    octokit: Octokit;
  }> {
    const installation = await this.resolveInstallation(owner);
    const cached = this.installationClientCache.get(installation.installationId);
    if (cached) {
      return {
        ownerLogin: installation.ownerLogin,
        installationId: installation.installationId,
        octokit: cached,
      };
    }

    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.appId,
        privateKey: this.normalizePrivateKey(this.privateKey),
        installationId: installation.installationId,
      },
      baseUrl: this.apiBaseUrl,
    });
    this.installationClientCache.set(installation.installationId, octokit);

    return {
      ownerLogin: installation.ownerLogin,
      installationId: installation.installationId,
      octokit,
    };
  }

  getTemplates(): GitHubBodyTemplate[] {
    return Object.values(this.templates);
  }

  async listInstallations(): Promise<InstallationInfo[]> {
    const installations = await this.appOctokit.paginate(
      this.appOctokit.rest.apps.listInstallations,
      { per_page: 100 },
    );
    return installations.map((installation) => ({
      installationId: installation.id,
      ownerLogin: installation.account?.login ?? "",
      targetType: installation.target_type,
      repositorySelection: installation.repository_selection,
    }));
  }

  async listRepositories(input: GitHubListRepositoriesInput = {}) {
    const { octokit, ownerLogin, installationId } = await this.installationOctokit(input.owner);
    const perPage = Math.min(Math.max(input.perPage ?? 50, 1), 100);
    const response = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: perPage,
    });

    return {
      owner: ownerLogin,
      installationId,
      totalCount: response.data.total_count,
      repositories: response.data.repositories.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
        url: repo.html_url,
      })),
    };
  }

  validateTemplate(input: GitHubValidationInput) {
    const template = this.resolveTemplate(input.templateKey);
    const validation = validateTemplateDescription(
      this.toIssueTemplate(template),
      input.body,
    );

    return {
      template,
      validation,
    };
  }

  normalizeTemplate(input: GitHubNormalizeInput) {
    const template = this.resolveTemplate(input.templateKey);
    const normalizedBody = normalizeDescriptionToTemplate(
      this.toIssueTemplate(template),
      input.body,
    );
    const validation = validateTemplateDescription(
      this.toIssueTemplate(template),
      normalizedBody,
    );

    return {
      template,
      normalizedBody,
      validation,
    };
  }

  async createIssueFromTemplate(input: GitHubCreateIssueInput) {
    if (!input.repo?.trim()) {
      throw new Error("repo is required.");
    }

    if (!input.title?.trim()) {
      throw new Error("title is required.");
    }

    const template = this.resolveTemplate(input.templateKey);
    const templateModel = this.toIssueTemplate(template);
    const shouldAutofill = input.autofillMissingSections ?? true;
    const initialBody =
      input.body && input.body.trim().length > 0
        ? input.body
        : buildTemplateSkeleton(templateModel);
    const initialValidation = validateTemplateDescription(templateModel, initialBody);

    if (this.templateStrictMode && !initialValidation.valid && !shouldAutofill) {
      throw new Error(
        `GitHub template validation failed: missing [${initialValidation.missingRequiredSections.join(
          ", ",
        )}] empty [${initialValidation.emptyRequiredSections.join(", ")}]`,
      );
    }

    const finalBody = shouldAutofill
      ? normalizeDescriptionToTemplate(templateModel, initialBody)
      : initialBody;
    const finalValidation = validateTemplateDescription(templateModel, finalBody);

    if (this.templateStrictMode && !finalValidation.valid) {
      throw new Error("Unable to create issue: final template validation failed.");
    }

    const { octokit, ownerLogin, installationId } = await this.installationOctokit(input.owner);
    const response = await octokit.rest.issues.create({
      owner: ownerLogin,
      repo: input.repo.trim(),
      title: input.title.trim(),
      body: finalBody,
      labels: input.labels,
      assignees: input.assignees,
      milestone: input.milestone,
    });

    return {
      owner: ownerLogin,
      installationId,
      template: template.key,
      validation: finalValidation,
      issue: {
        id: response.data.id,
        number: response.data.number,
        title: response.data.title,
        url: response.data.html_url,
      },
    };
  }

  async createPullRequestFromTemplate(input: GitHubCreatePullRequestInput) {
    if (!input.repo?.trim()) {
      throw new Error("repo is required.");
    }

    if (!input.title?.trim()) {
      throw new Error("title is required.");
    }

    if (!input.head?.trim()) {
      throw new Error("head is required.");
    }

    if (!input.base?.trim()) {
      throw new Error("base is required.");
    }

    const template = this.resolveTemplate(input.templateKey ?? "pull-request");
    const templateModel = this.toIssueTemplate(template);
    const shouldAutofill = input.autofillMissingSections ?? true;
    const initialBody =
      input.body && input.body.trim().length > 0
        ? input.body
        : buildTemplateSkeleton(templateModel);
    const initialValidation = validateTemplateDescription(templateModel, initialBody);

    if (this.templateStrictMode && !initialValidation.valid && !shouldAutofill) {
      throw new Error(
        `GitHub template validation failed: missing [${initialValidation.missingRequiredSections.join(
          ", ",
        )}] empty [${initialValidation.emptyRequiredSections.join(", ")}]`,
      );
    }

    const finalBody = shouldAutofill
      ? normalizeDescriptionToTemplate(templateModel, initialBody)
      : initialBody;
    const finalValidation = validateTemplateDescription(templateModel, finalBody);

    if (this.templateStrictMode && !finalValidation.valid) {
      throw new Error("Unable to create pull request: final template validation failed.");
    }

    const { octokit, ownerLogin, installationId } = await this.installationOctokit(input.owner);
    const response = await octokit.rest.pulls.create({
      owner: ownerLogin,
      repo: input.repo.trim(),
      title: input.title.trim(),
      head: input.head.trim(),
      base: input.base.trim(),
      body: finalBody,
      draft: input.draft,
      maintainer_can_modify: input.maintainerCanModify,
    });

    return {
      owner: ownerLogin,
      installationId,
      template: template.key,
      validation: finalValidation,
      pullRequest: {
        id: response.data.id,
        number: response.data.number,
        title: response.data.title,
        url: response.data.html_url,
      },
    };
  }
}

