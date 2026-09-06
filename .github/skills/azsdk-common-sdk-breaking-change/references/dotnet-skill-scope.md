# .NET SDK Skill Applicability

Verify the package's SDK plane from repository/package guidance before choosing a mitigation. A .NET language label, a `generator` route, or an installed skill alone does not establish applicability.

## Canonical SDK catalog

Read the effective catalog configured for the common CLI, or the SDK checkout's default `doc/dev/SDKBreakingChanges.md` when no override is configured. Preserve the catalog's provenance and use guidance matching that SDK version and plane. Do not invent a catalog MCP argument, silently replace an unreadable configured catalog with the default, or reconstruct an embedded catalog from these scope notes. Catalog-load/classification errors retain raw diagnostics and stop mitigation.

| SDK plane | Applicable guidance |
| --- | --- |
| Management | Check the SDK checkout's `.github/skills/mitigate-breaking-changes/SKILL.md`, read its actual instructions, and verify the selected pattern against that version. This existing external skill explicitly targets management-plane SDKs; it is not bundled here. |
| Data plane | Use the canonical catalog's generic naming/type/attribute/manual guidance only where verified applicable to data plane. Do not invoke the management-only skill or assume its ARM helpers apply. Unsupported or unverified cases require a manual handoff. |

Both planes still use the same common detector and re-evaluation workflow. Verified data-plane guidance may support a selected mitigation; the management skill's narrower scope does not disable data-plane detection or imply that every data-plane change is unfixable.

## Management guidance surfaces

The existing management skill covers SDK `Custom` partials/`CodeGenType` and TypeSpec `clientName`, `markAsPageable`, and `alternateType`. These names identify guidance to read, not universally safe recipes or permission to invent attribute/decorator arguments.

For management deterministic routes, verify the catalog's existing generator behavior rather than reimplementing it: `Utilities/BackCompatHelper.cs` conditional-header transformations require matching name/return/parameters and skip existing overloads or accepted removals. `Visitors/ModelFactoryVisitor.cs` and `ModelFactoryBackwardCompatHelper.cs` preserve previous contract overloads and forwarding after supported model reshapes. Do not weaken those guards, force skipped transformations, or manually rewrite generated methods/factories; regenerate and measure the existing implementation.

Determine the actual edit surface before delegating. Selected `client.tsp`/TypeSpec remedies use `azsdk_customized_code_update` with separately authorized `SpecInputs`; the presence of such a recipe in the SDK skill does not permit direct spec edits or a wider-scope retry. SDK-only work preserves all spec inputs and the pinned commit. If the classified route, verified remedy, or authorization conflicts, stop for a corrected classification/owner handoff rather than silently switching routes.

## Required pattern prerequisites

| Candidate remedy | Required evidence/approval |
| --- | --- |
| Base-type or inheritance fix | Verify baseline/current hierarchy parity before changing base types. Missing or mismatched hierarchy evidence requires investigation/manual judgment, not a speculative inheritance repair. |
| Legacy `hierarchyBuilding` | Obtain explicit owner approval before using it, in addition to hierarchy validation and edit authorization. Selecting a mitigation item is not that approval. |
| Management `WirePathAttribute` | Verify that the management emitter has `enable-wire-path-attribute: true` before applying the attribute. A missing/false option is a blocker; do not assume the attribute works or transfer this ARM-specific remedy to data plane. |

Changing an emitter option or other input to satisfy a prerequisite also requires authorization for that surface. Owner approval for a legacy pattern does not widen `editScope`, permit pin changes, or waive other prerequisites. If SDK-only scope cannot satisfy them, return the evidence and required spec/configuration work to the owner.

After an approved, supported mitigation, return to the common artifact refresh, detector rerun, and independent build/check/test gates. This reference records applicability and safety gates, not the detailed SDK pattern implementation.
