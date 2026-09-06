# Selected Mitigation Routing

First show the full change inventory, diagnostics, root-cause confidence, proposed actions, and unresolved risks. Obtain the user's selected items and authorized edit scope before changing files. Selection is not permission to suppress diagnostics or guess how an API should behave.

## Classified entry point

Use the selected break's `mitigation` field when present, preserving its `category`, `resolution`, and `originBreaks`. Category describes the cause, not the mitigation route; resolution text is guidance, not executable authorization.

| Exact mitigation value | Route |
| --- | --- |
| `generator` | Verify supported guidance for the package's language and SDK plane; the existing .NET mitigation skill applies only to management |
| `client customization` | Use `azsdk_customized_code_update` only within the separately authorized TypeSpec/custom-code scope |
| `manual` | Retain the evidence and request user/owner judgment; selecting the item does not permit automated generator/customization fixes |

A route is not proof of a supported fix. Conflicting or unverified evidence requires a blocked/manual handoff, not an automatic route switch. Missing/null .NET routes or invalid values stop classification/mitigation. Other languages without the field retain their evidence-based legacy workflow; do not require a .NET route or invoke the .NET skill for them.

## .NET applicability and supported patterns

Read the [SDK-plane prerequisites](dotnet-skill-scope.md) before delegating any .NET mitigation. The target SDK's existing `mitigate-breaking-changes` skill is management-focused, not generic data-plane guidance. Data-plane packages require separately verified applicable guidance or a manual handoff; do not apply ARM-specific patterns.

Delegate only a selected, proven pattern supported by that SDK version and plane, following its actual instructions. Missing/inapplicable guidance, ambiguous mappings, wire changes, and nondeterministic migrations require a handoff with diagnostics; never invent arguments, switches, decorators, partial implementations, or blanket AI fixes.

## TypeSpec and custom code

Use the current tool `azure-sdk-mcp:azsdk_customized_code_update`. Historical issue text calls it `azsdk_typespec_customized_code_update`; that old name is not a tool to invoke.

Supply `packagePath`, a `customizationRequest` describing only selected changes and their evidence, and `tspProjectPath` when an authorized TypeSpec workspace is needed. Explicitly select `editScope`:

| Scope | Authorized work |
| --- | --- |
| `SpecInputs` | Approved `client.tsp`/TypeSpec customization in the correct spec workspace; regenerate afterward |
| `CustomCode` | SDK-only hand-written customization, preserving all spec inputs and the pinned spec commit |
| `All` | Only when the user explicitly authorizes both surfaces; never a retry fallback |

For SDK-only work, do not modify `client.tsp`, `tspconfig.yaml`, `tsp-location.yaml`, cached spec inputs, or the pinned revision to make a fix possible. `SpecChangeRequired` must return a concrete handoff to the spec owner; never rerun with `All` or `SpecInputs` automatically.

A verified SDK naming-only change may be a TypeSpec customization candidate, but a wire rename, removed service operation, changed serialization, or changed semantics is not repaired merely by keeping the old SDK name. Ask for the necessary contract decision rather than proposing an unverified compatibility shim.

## Re-evaluation and stop conditions

The customization tool may regenerate and build internally. Preserve those diagnostics; a successful tool message/build is not a compatibility verdict. Ensure outputs match the selected inputs, rerun the detector, and then run ordinary build/check/tests. Keep unresolved and unclassified items visible.

Bound the caller's loop to **two user-approved mitigation rounds**, regardless of a tool's internal retries. Stop immediately on detector/classifier/tool errors, `SpecChangeRequired`, unsupported patterns, unchanged repeated failures, or new ambiguous/wire-contract changes. Report partial edits and evidence; do not silently retry, widen scope, apply suppressions, or mark the package clean. Resume only after the blocker is resolved and the user selects the next action.
