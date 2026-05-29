# GitHub App Wrapper

This MCP server can expose GitHub API tools using GitHub App authentication.

## Required Environment

Set all of the following:

- `GITHUB_APP_ID`
- `GITHUB_APP_OWNER`
- `GITHUB_APP_PRIVATE_KEY`

`GITHUB_APP_PRIVATE_KEY` supports escaped newlines (`\n`) for `.env` usage.

## Installation Resolution

For repository write operations, the wrapper:

1. Resolves the target owner (tool argument `owner` or `GITHUB_APP_OWNER`)
2. Locates the matching app installation for that owner
3. Uses installation auth for repository-scoped API calls

## Exposed Methods

1. `github_list_installations`
2. `github_list_repositories`
3. `github_list_templates`
4. `github_validate_template`
5. `github_normalize_template`
6. `github_create_issue_from_template`
7. `github_create_pull_request_from_template`

## Pull Request Binding Guarantee

`github_create_pull_request_from_template` guarantees a bound issue:

1. Reads PR body for same-repo closing references (`Closes #123`, `Fixes #123`, etc.).
2. If referenced issue exists, reuses it.
3. If no valid referenced issue exists, creates a new issue automatically.
4. Ensures PR body contains `Closes #<issue>` so GitHub links PR and issue.

Optional binding controls:

- `bindingIssueTemplateKey`
- `bindingIssueTitle`
- `bindingIssueBody`
- `bindingIssueLabels`
- `bindingIssueAssignees`
- `bindingIssueMilestone`

## Template Enforcement

Built-in templates:

- `issue-bug`
- `issue-feature`
- `issue-product-opportunity`
- `pull-request`

Behavior:

- required sections must exist and be non-empty in strict mode
- normalization can auto-insert missing sections
- custom extra sections are preserved

Override/add templates using `GITHUB_TEMPLATE_OVERRIDES_JSON`.
