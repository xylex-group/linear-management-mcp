# linear-management-mcp

TypeScript MCP server that wraps the [Linear](https://linear.app/developers/sdk) API with template-aware issue workflows.

It is intentionally focused on one operational goal: enforce repeatable issue templates (sections, structure, normalization) when creating or updating Linear issues.

## What You Get

- MCP server over `stdio`
- Linear API wrapper (`@linear/sdk`) with a small stable surface
- Built-in templates: `bug`, `feature-request`, `engineering-task`
- Strict template validation + auto-normalization helpers
- Optional template overrides from environment

## Install

```bash
npm install
cp .env.example .env
```

Set `LINEAR_API_KEY` in `.env` before starting.

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

1. `linear_list_teams`
2. `linear_list_templates`
3. `linear_validate_template`
4. `linear_normalize_template`
5. `linear_create_issue_from_template`
6. `linear_apply_template_to_issue`

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
| `SERVER_NAME` | No | MCP server name override (default: `linear-management-mcp`). |
| `SERVER_VERSION` | No | MCP server version override (default: `0.1.0`). |

## Template Enforcement Behavior

1. Templates define required and optional `## Section` headings.
2. Validation fails when required sections are missing or empty.
3. Normalization can auto-insert missing sections while preserving extra custom sections.
4. In strict mode, non-compliant issue writes are rejected.

Extended notes and examples are in [docs/template-enforcement.md](docs/template-enforcement.md).

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
        "TEMPLATE_STRICT_MODE": "true"
      }
    }
  }
}
```
