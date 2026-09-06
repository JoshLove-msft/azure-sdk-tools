---
name: azsdk-common-sdk-breaking-change
license: MIT
metadata:
  version: "1.0.0"
  distribution: shared
description: "Detect Azure SDK compatibility changes, interpret raw or classified detector reports, and route mitigation against the released baseline. WHEN: \"detect SDK breaking changes\", \"fix SDK breaking changes\", \"review SDK compatibility\", \"review raw SDK detector output\", \"explain hasBreakingChange\", \"changesOnly results\", \"ApiCompat failure\", \"breaking changes in spec PR\", \"breaking changes in SDK PR\"."
compatibility: "azure-sdk-mcp server, local SDK repository and current artifacts; verified language- and SDK-plane-specific mitigation guidance"
---

# SDK Breaking Changes

Use the same compatibility workflow for local development, spec PRs, and SDK PRs. Ordinary generation and build-only fixes remain in `azsdk-common-generate-sdk-locally`.

## Steps

1. **Establish context** - Read the [detection contract](references/detection.md). Identify the package, language, SDK plane, baseline, revision, current artifacts, and authorized edit scope. Generate or refresh artifacts only when needed.
2. **Detect independently** - For captured-report review, interpret the supplied evidence without rerunning tools unless requested. Otherwise call `azure-sdk-mcp:azsdk_package_detect_breaking_change` with `packagePath` and `changesOnly: false`. For .NET, detection on current artifacts is independent of compilation and analyzer checks; a failed build must not hide compatibility evidence.
3. **Explain before editing** - Present every change, diagnostics, root-cause confidence, and supplied `category`, `resolution`, `originBreaks`, and `mitigation`. Removals plus additions alone do not prove a rename. Ask the user to select mitigations; detection-only requests make no edits.
4. **Route selected mitigations** - Read [mitigation routing](references/mitigation.md) and, for .NET, [SDK-plane prerequisites](references/dotnet-skill-scope.md). Use each selected break's `mitigation` when supplied: `generator` uses verified plane-specific SDK guidance, `client customization` uses `azure-sdk-mcp:azsdk_customized_code_update`, and `manual` requires owner judgment. The existing .NET mitigation skill is management-only. A route never authorizes edits or wider scope.
5. **Re-evaluate** - Refresh affected artifacts, rerun detection, then run ordinary build, check, and test tools. Report these gates separately. Allow at most two user-approved mitigation rounds; stop sooner on errors, repeated unchanged failures, or a scope handoff.
6. **Return to the caller** - Follow [workflow integration](references/workflows.md). Report resolved, unresolved, and unclassified changes with evidence; do not automatically post PR comments, approve, publish, or suppress breaks.

## Guardrails

- A completed detector's breaking flag remains authoritative for its verified baseline, artifacts, and comparison scope, even in raw `changesOnly` output. Classification explains causes and routes mitigation; it does not ratify or override the native verdict.
- Missing/stale artifacts, missing baseline, malformed results, unsupported detection, and detector failures are **blocked or inconclusive**, never "no breaking changes." Classifier/catalog/tool errors preserve known detector evidence but block mitigation. Preserve diagnostics and stop the mitigation loop.
- Never directly edit generated SDK files, disable compatibility/analyzer checks, or invent a compatibility fix.
- SDK-only custom-code work must preserve spec inputs and the pinned spec commit. `SpecChangeRequired` is a handoff, not permission to retry with wider scope.
- If MCP or verified SDK mitigation guidance is unavailable, report the missing prerequisite and provide a manual handoff; do not fabricate tool names, arguments, or results.
