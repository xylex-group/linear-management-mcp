# linear-management-mcp

TypeScript MCP server that wraps:

- [Linear SDK](https://linear.app/developers/sdk) for issue workflows
- GitHub API through GitHub App authentication (`@octokit/*`)

Both wrappers support template-driven markdown enforcement (`## Heading` sections) for consistent issue/PR payloads.

## What You Get

- MCP server over `stdio`
- Linear wrapper with template-aware issue methods
- GitHub App wrapper with installation-aware repository/issue/PR methods
- Strict validation and normalization for markdown body templates
- Environment-based template overrides for both Linear and GitHub

## Install

```bash
npm install
cp .env.example .env
```

Set `LINEAR_API_KEY` in `.env` before starting.

To enable GitHub tools, also set:

- `GITHUB_APP_ID`
- `GITHUB_APP_OWNER`
- `GITHUB_APP_PRIVATE_KEY`

## Build And Run

```bash
npm run build
npm start
```

For local development:

```bash
npm run dev
```

## MCP Tools

Linear tools:

1. `linear_list_teams`
2. `linear_list_templates`
3. `linear_validate_template`
4. `linear_normalize_template`
5. `linear_create_issue_from_template`
6. `linear_apply_template_to_issue`

GitHub tools (enabled only when `GITHUB_APP_*` is configured):

1. `github_list_installations`
2. `github_list_repositories`
3. `github_list_templates`
4. `github_validate_template`
5. `github_normalize_template`
6. `github_create_issue_from_template`
7. `github_create_pull_request_from_template`

### PR-to-Issue Binding Flow

`github_create_pull_request_from_template` now enforces a bound issue:

1. If PR body already contains a valid same-repo closing reference (for example `Closes #123`), it reuses that issue.
2. If no valid linked issue exists, it creates one automatically.
3. It ensures the PR body includes a closing keyword reference so PR and issue are linked.

Optional inputs for auto-created issue:

- `bindingIssueTemplateKey`
- `bindingIssueTitle`
- `bindingIssueBody`
- `bindingIssueLabels`
- `bindingIssueAssignees`
- `bindingIssueMilestone`

### `linear_create_issue_from_template` (core flow)

Required:

- `title`

Optional:

- `templateKey` (defaults to `LINEAR_DEFAULT_TEMPLATE` or `engineering-task`)
- `teamId` (defaults to `LINEAR_DEFAULT_TEAM_ID`)
- `description`
- `priority` (`0-4`)
- `labelIds`, `assigneeId`, `stateId`, `projectId`
- `autofillMissingSections` (defaults to `true`)

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `LINEAR_API_KEY` | Yes | Personal API key or service key for Linear SDK access. |
| `LINEAR_DEFAULT_TEAM_ID` | No | Default team used by create calls when `teamId` is omitted. |
| `LINEAR_DEFAULT_TEMPLATE` | No | Default template key if `templateKey` is omitted. |
| `TEMPLATE_STRICT_MODE` | No | `true` by default. Blocks invalid template writes. |
| `LINEAR_TEMPLATE_OVERRIDES_JSON` | No | JSON object to add/override template definitions. |
| `GITHUB_APP_ID` | No* | GitHub App ID. Required to enable GitHub wrapper tools. |
| `GITHUB_APP_OWNER` | No* | Default GitHub owner/org to resolve installation context. |
| `GITHUB_APP_PRIVATE_KEY` | No* | GitHub App private key PEM (`\\n` escaped form supported). |
| `GITHUB_API_BASE_URL` | No | Optional GitHub Enterprise API base URL. |
| `GITHUB_DEFAULT_TEMPLATE` | No | Default GitHub template key (for issue/PR body). |
| `GITHUB_TEMPLATE_STRICT_MODE` | No | `true` by default for GitHub template write enforcement. |
| `GITHUB_TEMPLATE_OVERRIDES_JSON` | No | JSON object to add/override GitHub templates. |
| `SERVER_NAME` | No | MCP server name override (default: `linear-management-mcp`). |
| `SERVER_VERSION` | No | MCP server version override (default: `0.1.0`). |

`*` GitHub variables are optional overall, but all are required together when enabling GitHub tools.

## Template Enforcement Behavior

1. Templates define required and optional `## Section` headings.
2. Validation fails when required sections are missing or empty.
3. Normalization can auto-insert missing sections while preserving extra custom sections.
4. In strict mode, non-compliant issue writes are rejected.

Extended notes and examples are in:

- [docs/template-enforcement.md](docs/template-enforcement.md)
- [docs/github-app-wrapper.md](docs/github-app-wrapper.md)

## Example MCP Client Wiring

```json
{
  "mcpServers": {
    "linear-management": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/linear-management-mcp",
      "env": {
        "LINEAR_API_KEY": "lin_api_xxxxx",
        "LINEAR_DEFAULT_TEAM_ID": "team-uuid",
        "TEMPLATE_STRICT_MODE": "true",
        "GITHUB_APP_ID": "2995603",
        "GITHUB_APP_OWNER": "your-org-or-user",
        "GITHUB_APP_PRIVATE_KEY": "-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----"
      }
    }
  }
}
```
