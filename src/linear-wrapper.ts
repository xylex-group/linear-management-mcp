import { LinearClient } from "@linear/sdk";

import {
  buildTemplateSkeleton,
  normalizeDescriptionToTemplate,
  validateTemplateDescription,
} from "./template-enforcer.js";
import { normalizeTemplateKey, type IssueTemplate, type TemplateCollection } from "./templates.js";

export interface CreateIssueFromTemplateInput {
  title: string;
  templateKey?: string;
  teamId?: string;
  description?: string;
  priority?: number;
  labelIds?: string[];
  assigneeId?: string;
  stateId?: string;
  projectId?: string;
  autofillMissingSections?: boolean;
}

export interface ValidateTemplateInput {
  templateKey?: string;
  description: string;
}

export interface NormalizeTemplateInput {
  templateKey?: string;
  description: string;
}

export interface ApplyTemplateToIssueInput {
  issueId: string;
  templateKey?: string;
}

export class LinearTemplateService {
  private readonly client: LinearClient;

  constructor(
    apiKey: string,
    private readonly templates: TemplateCollection,
    private readonly templateStrictMode: boolean,
    private readonly defaultTeamId?: string,
    private readonly defaultTemplate?: string,
  ) {
    this.client = new LinearClient({ apiKey });
  }

  getTemplates(): IssueTemplate[] {
    return Object.values(this.templates);
  }

  private resolveTemplate(templateKey?: string): IssueTemplate {
    const key = normalizeTemplateKey(templateKey ?? this.defaultTemplate ?? "engineering-task");
    const template = this.templates[key];

    if (!template) {
      const knownTemplates = Object.keys(this.templates).join(", ");
      throw new Error(`Unknown template '${key}'. Available templates: ${knownTemplates}.`);
    }

    return template;
  }

  async listTeams() {
    const teams = await this.client.teams();
    return teams.nodes.map((team) => ({
      id: team.id,
      key: team.key,
      name: team.name,
      description: team.description ?? "",
    }));
  }

  async validateTemplate(input: ValidateTemplateInput) {
    const template = this.resolveTemplate(input.templateKey);
    const validation = validateTemplateDescription(template, input.description);

    return {
      template,
      validation,
    };
  }

  normalizeTemplate(input: NormalizeTemplateInput) {
    const template = this.resolveTemplate(input.templateKey);
    const normalizedDescription = normalizeDescriptionToTemplate(template, input.description);
    const validation = validateTemplateDescription(template, normalizedDescription);

    return {
      template,
      normalizedDescription,
      validation,
    };
  }

  async createIssueFromTemplate(input: CreateIssueFromTemplateInput) {
    const template = this.resolveTemplate(input.templateKey);
    const teamId = input.teamId ?? this.defaultTeamId;

    if (!teamId) {
      throw new Error(
        "teamId is required. Pass teamId explicitly or set LINEAR_DEFAULT_TEAM_ID in the environment.",
      );
    }

    if (!input.title?.trim()) {
      throw new Error("title is required.");
    }

    const title = input.title.trim().startsWith(template.titlePrefix)
      ? input.title.trim()
      : `${template.titlePrefix} ${input.title.trim()}`;

    const shouldAutofill = input.autofillMissingSections ?? true;
    const initialDescription =
      input.description && input.description.trim().length > 0
        ? input.description
        : buildTemplateSkeleton(template);

    const initialValidation = validateTemplateDescription(template, initialDescription);

    if (this.templateStrictMode && !initialValidation.valid && !shouldAutofill) {
      throw new Error(
        `Template validation failed: missing [${initialValidation.missingRequiredSections.join(
          ", ",
        )}] empty [${initialValidation.emptyRequiredSections.join(", ")}]`,
      );
    }

    const finalDescription = shouldAutofill
      ? normalizeDescriptionToTemplate(template, initialDescription)
      : initialDescription;

    const finalValidation = validateTemplateDescription(template, finalDescription);
    if (this.templateStrictMode && !finalValidation.valid) {
      throw new Error(
        `Unable to create issue: final template validation failed for template '${template.key}'.`,
      );
    }

    const payload = await this.client.createIssue({
      title,
      teamId,
      description: finalDescription,
      priority: input.priority,
      labelIds: input.labelIds,
      assigneeId: input.assigneeId,
      stateId: input.stateId,
      projectId: input.projectId,
    });

    const issue = await payload.issue;

    return {
      success: payload.success,
      issue: issue
        ? {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            url: issue.url,
          }
        : null,
      template: template.key,
      validation: finalValidation,
    };
  }

  async applyTemplateToIssue(input: ApplyTemplateToIssueInput) {
    if (!input.issueId.trim()) {
      throw new Error("issueId is required.");
    }

    const template = this.resolveTemplate(input.templateKey);
    const issue = await this.client.issue(input.issueId.trim());

    if (!issue?.id) {
      throw new Error(`Issue '${input.issueId}' not found.`);
    }

    const normalizedDescription = normalizeDescriptionToTemplate(
      template,
      issue.description ?? "",
    );
    const validation = validateTemplateDescription(template, normalizedDescription);

    if (this.templateStrictMode && !validation.valid) {
      throw new Error(
        `Unable to enforce template on issue '${input.issueId}' because validation failed.`,
      );
    }

    const updatePayload = await this.client.updateIssue(issue.id, {
      description: normalizedDescription,
    });
    const updatedIssue = await updatePayload.issue;

    return {
      success: updatePayload.success,
      issue: updatedIssue
        ? {
            id: updatedIssue.id,
            identifier: updatedIssue.identifier,
            title: updatedIssue.title,
            url: updatedIssue.url,
          }
        : null,
      template: template.key,
      validation,
    };
  }
}

