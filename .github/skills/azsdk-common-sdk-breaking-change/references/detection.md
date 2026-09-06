# Detection Contract

## Inputs and provenance

Resolve the package/configuration from the caller's checkout and record language, identity/path, revision, artifacts, and baseline. The normal baseline is the **latest GA release**, not a preview or arbitrary snapshot. If no GA baseline exists, retain the CLI's **compatibility not evaluated** message and seek an explicit initial-release/manual decision; never invent a comparison.

| MCP tool | Use |
| --- | --- |
| `azure-sdk-mcp:azsdk_package_generate_code` | Generate from the verified configuration when source inputs changed or output is missing |
| `azure-sdk-mcp:azsdk_package_detect_breaking_change` | Detect and classify compatibility changes independently |
| `azure-sdk-mcp:azsdk_package_build_code` | Refresh required compiled artifacts when needed; separately report compilation/analyzer results |
| `azure-sdk-mcp:azsdk_package_run_check` | Run the ordinary package validation gate |
| `azure-sdk-mcp:azsdk_package_run_tests` | Run the ordinary package test gate |

Discover each tool's current input schema before calling it. Detection accepts:

| Parameter | Rule |
| --- | --- |
| `packagePath` | Required path to the target SDK package |
| `tspConfigPath` | Optional verified TypeSpec configuration path when needed |
| `changesOnly` | Use `false` for classification and mitigation; `true` supplies the detector's breaking-change verdict and raw changes without root-cause classification |
| `localSdkChangeJsonFilePath` | Optional existing detector output file, only when its format and package/revision provenance are verified; never fabricate evidence |

## .NET artifacts and independent gates

.NET detection uses ApiCompat as its primary compatibility evidence on existing/current artifacts. It must not require a successful source build or analyzer gate before reporting that evidence. If the artifacts already match the current inputs, detect even when compilation or analyzers fail, and retain both results.

Keep native SDK-companion extraction behind the common MCP detector. A missing companion script is a blocker, not a clean result; do not guess script names or invocation flags.

Missing or stale artifacts are an explicit blocker. Generate/rebuild only as needed to produce current comparison inputs, without disabling checks. If a failed refresh leaves only an older assembly, that assembly cannot establish the current change's compatibility. Report any earlier snapshot evidence separately and stop until valid current inputs are available.

After an approved mitigation, refresh the affected outputs and detect again. Run the ordinary build/check/test gates afterward; none substitutes for detection. If a later build changes the compared artifacts, repeat detection on those current artifacts before claiming compatibility.

## Interpret the response

The common response has outer language/package metadata and a `result` containing `changes`, `hasBreakingChange`, and `breakingChanges`. Preserve raw evidence, diagnostics, and each break's `breakingChange`, `category`, `resolution`, `originBreaks`, and optional `mitigation`. Map `originBreaks` back to the original diagnostics without dropping other raw/additive changes.

`changes` is Markdown text. Optional `details` carries baseline/API evidence, diagnostics, and limitations; nested flags or diagnostics never replace the primary compatibility fields.

.NET requires every classified break to have `mitigation` exactly `generator`, `client customization`, or `manual`. Missing/null .NET routes or any invalid supplied route are classification errors: retain evidence and stop, never infer a route from `category` or resolution text. Other languages may omit `mitigation` under their legacy contract; do not impose .NET-only requirements on them.

ApiCompat's completed detector verdict does not require LLM classification. Raw `hasBreakingChange: true` remains evidence of breaks, including when classification fails; raw `false` from a successful comparison with a verified GA baseline and current artifacts means no detected breaks within that comparison's scope. Neither a raw report nor an empty classification list authorizes mitigation.

Require complete, valid classification and mitigation routes before applying selected fixes. A success message without the required detector fields, null/malformed results, inconsistent classified flags/lists, missing baseline, or detector failure is inconclusive. Classifier/catalog-load errors leave known detector evidence intact but block automated mitigation. Preserve raw details; do not substitute empty evidence or an embedded catalog. A valid `hasBreakingChange: false` does not validate compilation, analyzers, tests, or wire behavior.

Present every change, including additions and unknown classifications:

| Change/API | Classification | Evidence/diagnostic | Root cause and confidence | Proposed route |
| --- | --- | --- | --- | --- |
| Original symbol/signature and stable ID when supplied | Breaking, non-breaking, or unclassified; retain category/resolution | Original diagnostics and originBreaks, old/new surface, compared artifacts | Proven cause or hypothesis with evidence and uncertainty | Supplied mitigation enum; legacy proposal only when the language permits omission |

Patterns classify removals, additions, and signature changes, not causality. A removal/addition pair is not a proven rename. Keep classifier suggestions as hypotheses until proven; retain errors and explain blockers.
