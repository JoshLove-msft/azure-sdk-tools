# Breaking-Change Skill Evaluations

These are isolated skill routing and capability cases, not executions of .NET
generator mitigations. All use the existing `azsdk-mcp-mock` environment. No live
MCP endpoints, credentials, production identifiers, or external writes are needed
by the scenarios. Running the Copilot executor/LLM graders still requires an
appropriately configured evaluation identity; linting does not.

| Suite | Coverage |
| --- | --- |
| `routing.eval.yaml` | Activation/boundaries and handoffs; five real-schema mock detector cases tagged `coverage=mock-detector` cover .NET management/data plane, Java, catalog error/raw evidence, and no-GA status |
| `evidence.eval.yaml` | Complete change inventory and confidence; compilation/analyzer independence; missing GA baseline, missing/stale artifacts, detector/classifier failures, malformed/inconsistent results, native verdicts without classification, unsupported detection, valid additive Java result |
| `mitigation.eval.yaml` | Verified external .NET generator guidance, unavailable guidance, selected TypeSpec vs SDK-only scopes, `SpecChangeRequired`, ambiguous rename, wire changes, generated-code/suppression safety, bounded retries, tool errors, post-mitigation re-evaluation |
| `classified-routes.eval.yaml` | Per-break mitigation enum dispatch and metadata preservation; selected-item boundaries, manual routing, scope independence, missing/null/invalid .NET routes, other-language legacy/explicit-route behavior |
| `dotnet-plane-scope.eval.yaml` | Management-only SDK skill versus data-plane guidance; SDK/TypeSpec edit surfaces, hierarchy parity, legacy owner approval, WirePath emitter prerequisite, and companion-extractor errors |
| `catalog.eval.yaml` | Canonical/configured SDK catalog, data-plane generic patterns, preserved raw catalog-load errors, existing management helper guards, and model-factory contract preservation |
| Local generation's `normal-generation.eval.yaml` | Normal .NET data-plane/management generation, metadata distinction, ordinary analyzer and Java customization regressions |

Coverage is split into `*.eval.yaml` files because the current skill CI shard
glob selects that spelling. `.vally.yaml` also discovers these files. Boundary
cases mount and require the intended neighboring skill. Captured-report/dry-run
cases deliberately forbid MCP calls and grade reasoning plus tool absence;
their reports are scenario inputs, not newly executed detector evidence.

## Local validation

Use the repository-pinned Vally CLI and its existing setup instructions in
`eng/skill-eval/README.md`. From `.github/skills`:

```powershell
vally lint azsdk-common-sdk-breaking-change --strict
vally lint -e azsdk-common-sdk-breaking-change\evals\routing.eval.yaml --strict
vally lint -e azsdk-common-sdk-breaking-change\evals\evidence.eval.yaml --strict
vally lint -e azsdk-common-sdk-breaking-change\evals\mitigation.eval.yaml --strict
vally lint -e azsdk-common-sdk-breaking-change\evals\classified-routes.eval.yaml --strict
vally lint -e azsdk-common-sdk-breaking-change\evals\dotnet-plane-scope.eval.yaml --strict
vally lint -e azsdk-common-sdk-breaking-change\evals\catalog.eval.yaml --strict
vally lint -e azsdk-common-generate-sdk-locally\evals\normal-generation.eval.yaml --strict
```

Build the mock with the existing eval setup (or the command below). The mock does
not use the production CLI's native Copilot agent, so the supported
`CopilotSkipCliDownload` build option avoids that unused download:

```powershell
# From the repository root:
dotnet test tools\azsdk-cli\Azure.Sdk.Tools.Mock\Tests\Azure.Sdk.Tools.Mock.Tests.csproj --nologo -p:CopilotSkipCliDownload=true
dotnet build tools\azsdk-cli\Azure.Sdk.Tools.Mock -c Debug -o artifacts\mcp\mock --nologo -p:CopilotSkipCliDownload=true
```

With Vally's own executor/runtime and the existing model identity available, run
only the five detector-backed cases from `.github\skills`:

```powershell
vally eval -e azsdk-common-sdk-breaking-change\evals\routing.eval.yaml `
  --tag coverage=mock-detector --workers 1 --max-retries 0 --output jsonl `
  --output-dir .\results\breaking-change-mock
```

The two captured-report cases tagged `coverage=native-verdict` in
`evidence.eval.yaml` cover positive and negative detector verdicts without LLM
classification; they forbid MCP calls.

Do not substitute a live MCP environment to work around incomplete mocks.

## Implemented mock coverage

`Azure.Sdk.Tools.Mock` now has `PackageDetectBreakingChangeHandler`, using the real
reflected tool schema and typed common responses. It supplies .NET management,
.NET data-plane, and legacy Java fixtures; changes-only output; additive-only
results; explicit no-GA/missing/stale-artifact outcomes; and classifier/catalog
errors that retain raw `details`. The positive routing cases require the actual
fixture result, not the former generic success fallback.

Vally 0.14's `tool-calls.args` matches string-valued arguments only. These cases
use `args.packagePath` for the path and a full-argument `pattern` for Boolean
`changesOnly: false`; a string `"false"` must not satisfy the Boolean contract.

The mock's nested NUnit project covers wire/primitive arguments, metadata and
result serialization, error/raw evidence, fixture isolation, and equality with
the production MCP name/description/schema. See
`tools\azsdk-cli\Azure.Sdk.Tools.Mock\README.md` for fixture paths and commands.

## Remaining mock integration, not production gaps

Full execution/order/argument/file-integrity scenarios belong in the existing
mock workflow tier and need support outside this skill's directory:

| Mock surface | Required additions |
| --- | --- |
| Detector fixture expansion | Selected `generator`/`client customization` scenarios (current .NET fixtures use `manual`), local JSON replay, further packages/languages, and malformed/invalid-classification runtime cases; no native detector duplication |
| Package generation/build/check/test handlers | Stateful artifact freshness and separate compilation/analyzer failures, including valid current-artifact detection despite other failed gates |
| `Handlers/TypeSpec/TypeSpecHandlers.cs` | `azsdk_customized_code_update` scenarios honoring `SpecInputs`/`CustomCode`/`All`, `SpecChangeRequired`, partial edits/errors and rerun outcomes; replace the canned `src/Generated/Customization/...` patch with authorized hand-written/spec fixtures |
| SDK/workflow fixtures | Canonical doc/dev/SDKBreakingChanges.md and configured catalog variants, management-only skill and applicable generic data-plane entries; management helper eligibility/skip behavior and factory contracts; hierarchy/approval/WirePath prerequisites; immutable spec inputs/pin and common reruns |

Production native extraction, catalog loading, classification, and failure
preservation are separate CLI/SDK behavior owned by their implementations and
tests. The gaps above describe what the canned MCP evaluation environment cannot
yet exercise end-to-end. The nested NUnit project is included in
`Azure.Sdk.Tools.Cli.sln` and the existing azsdk-cli CI test jobs.

Do not fabricate supported generator fixes in the skill or duplicate the SDK's
mitigation implementation just to make an evaluation pass.
