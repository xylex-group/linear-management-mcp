# Template Enforcement

This server uses markdown `## Heading` sections as the contract surface for issue templates.

## Built-in Templates

1. `bug`
2. `feature-request`
3. `engineering-task`
4. `product-opportunity`

Each template has:

- `titlePrefix` for issue titles
- `requiredSections`
- `optionalSections`

## Validation Rules

`linear_validate_template` marks a document invalid when:

- a required section heading is missing
- a required section exists but is empty

Unknown sections are allowed and returned in `unknownSections` for visibility.

## Normalization Rules

`linear_normalize_template` and creation with `autofillMissingSections=true`:

- insert missing required sections with `_TODO: fill this section._`
- insert missing optional sections with `_Optional._`
- preserve custom sections not part of the template

## Strict Mode

When `TEMPLATE_STRICT_MODE=true`:

- `linear_create_issue_from_template` rejects invalid descriptions
- `linear_apply_template_to_issue` rejects writes when the normalized content still fails validation

## Override Templates Via ENV

Use `LINEAR_TEMPLATE_OVERRIDES_JSON` to add or override templates:

```json
{
  "security-review": {
    "displayName": "Security Review",
    "description": "Template for security-sensitive changes",
    "titlePrefix": "[Security]",
    "requiredSections": ["Context", "Threats", "Mitigation", "Validation"],
    "optionalSections": ["References"]
  }
}
```
