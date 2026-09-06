# Common Workflow Integration

Use one detect/explain/select/mitigate/re-evaluate workflow, not separate compatibility rules for spec PRs and SDK PRs. Preserve the caller's package/language set, verify SDK plane before mitigation, and keep ordinary generation behavior.

| Entry point | Integration |
| --- | --- |
| Local inner loop | Generate when required. For requested or reported compatibility changes, enter this skill before treating them as ordinary build/customization errors. With current .NET artifacts, detect independently even when build/analyzer checks fail. |
| Spec PR | Generate from that PR's verified TypeSpec inputs into the intended language SDK checkout. Detect per affected package. Selected spec-owned customizations use `azsdk_customized_code_update` with `SpecInputs`; .NET generator-supported mitigations use verified SDK guidance. Service/wire changes still need an owner decision. |
| SDK PR | Use the PR's current package/artifacts and pinned TypeSpec revision. SDK-only customization uses `CustomCode`; never advance the pin or modify spec inputs to escape that scope. Return `SpecChangeRequired` to the spec owner. |
| Pipeline generation | Keep `azsdk-common-generate-sdk-pipeline` for release-plan generation and SDK PR links. A successful pipeline or PR link alone is not a compatibility result. If breaks are reported or compatibility review is requested, obtain matching evidence/current local artifacts and use this skill; without them report a handoff, not a clean result. |
| CI diagnosis/fix | Pipeline analysis remains read-only and retains compilation/analyzer failures separately from compatibility evidence. The pipeline fixer delegates compatibility changes here instead of directly editing generated APIs, adding suppressions, or applying a generic fix. |
| Release readiness | Keep `azsdk-common-sdk-release` for normal readiness/release operations. If compatibility is a reported blocker or the user requests mitigation before release, resolve it here before retrying readiness. This skill does not publish or approve releases. |

Route selected items using each supplied `mitigation` value, not the PR type or `category`; the route does not grant edit scope. Preserve `resolution` and `originBreaks` with the evidence. Regenerate/rebuild artifacts as required, rerun detection, and then perform ordinary build/check/tests. Do not skip a failing gate, treat API review as compatibility, or automatically approve intentional breaks.

Report the package/language, compared baseline and revision, all detected/classified changes and diagnostics, root-cause confidence, selected actions, resolved/unresolved/unclassified items, and independent build/analyzer/check/test outcomes. State missing evidence, manual decisions, scope handoffs, and retry limits explicitly.

Do not automatically post PR comments, approvals, or suppression changes in either PR flow. Return evidence and proposed next actions to the caller/user; respect any separate authorization requirements for external writes.
