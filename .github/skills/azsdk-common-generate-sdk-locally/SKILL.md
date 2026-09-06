---
name: azsdk-common-generate-sdk-locally
license: MIT
metadata:
  version: "1.2.0"
  distribution: shared
description: 'Generate, build, and test Azure SDKs locally from TypeSpec with automatic customization. WHEN: "generate SDK locally", "build SDK", "run SDK tests", "run CI checks", "validate package", "run checks", "update changelog", "fix SDK build errors", "resolve SDK generation errors", "customize TypeSpec", "rename SDK client", "rename SDK model", "hide operation from SDK", "fix analyzer errors", "resolve customization drift", "create subclient", "update metadata", "update version". DO NOT USE FOR: publishing to package registries, CI pipeline configuration, API design review. INVOKES: azsdk_verify_setup, azsdk_package_generate_code, azsdk_package_build_code, azsdk_package_run_check, azsdk_package_run_tests, azsdk_customized_code_update, azsdk_package_update_changelog_content, azsdk_package_update_metadata, azsdk_package_update_version.'
compatibility: "azure-sdk-mcp server, local azure-sdk-for-{language} clone, language build tools"
---

# Generate SDK Locally

This skill generates, builds, and tests Azure SDKs locally from TypeSpec with automatic customization support, covering the end-to-end workflow for fixing generation issues, applying SDK-specific updates, and refreshing package metadata when needed.

## Triggers

USE FOR: generate, build, and test Azure SDKs locally from TypeSpec with automatic customization; update changelog; fix SDK build errors; resolve SDK generation errors; customize TypeSpec; rename SDK client or model; hide operation from SDK; fix analyzer errors; resolve customization drift; create subclient; update metadata; update version
WHEN: "generate SDK locally", "build SDK", "run SDK tests", "update changelog", "fix SDK build errors", "resolve SDK generation errors", "customize TypeSpec", "rename SDK client", "rename SDK model", "hide operation from SDK", "fix analyzer errors", "resolve customization drift", "create subclient", "update metadata", "update version"
DO NOT USE FOR: publishing to package registries, CI pipeline configuration, API design review

## Rules

- This skill generates an SDK **locally** from a local clone. Use it to generate an SDK **only when the user indicates local generation** — they say "local"/"locally", or are working from a local clone. If the user asks to "generate SDK for **all languages**", to generate **for a release plan / release ID** (even a single language), to generate **without a local clone**, or wants SDK **pull requests created** for them, do **not** generate locally — use the `azsdk-common-generate-sdk-pipeline` skill, which runs the SDK generation pipeline for each language and produces the SDK pull requests.
- Never use `azure-sdk-mcp:azsdk_get_sdk_pull_request_link` or `azure-sdk-mcp:azsdk_get_pull_request` to _generate_ an SDK; those only retrieve links for SDKs that were already generated.
- Requires the `azure-sdk-mcp` server for the MCP workflow; without MCP, use `npm exec --prefix eng/common/tsp-client -- tsp-client` CLI.
- Verify the target language repo and the correct TypeSpec configuration file before generation.
- For requested or reported SDK compatibility/breaking changes, use `azsdk-common-sdk-breaking-change` before applying fixes. In .NET, detect on current artifacts independently of compilation/analyzer success; never hide breaks behind a failed build. Normal generation and build-only customization keep the steps below.
- If compatibility remains unresolved/inconclusive or returns `SpecChangeRequired`, report the handoff rather than continuing to finalization as though validation passed.
- After generation or customization, run the check and test steps before updating metadata or finalizing changes.

## MCP Tools

| Tool                                                   | Purpose                                                |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `azure-sdk-mcp:azsdk_verify_setup`                     | Verify environment                                     |
| `azure-sdk-mcp:azsdk_package_generate_code`            | Generate SDK                                           |
| `azure-sdk-mcp:azsdk_package_build_code`               | Build package                                          |
| `azure-sdk-mcp:azsdk_package_run_check`                | Validate package                                       |
| `azure-sdk-mcp:azsdk_package_run_tests`                | Run tests                                              |
| `azure-sdk-mcp:azsdk_customized_code_update`           | Apply customizations (includes regeneration and build) |
| `azure-sdk-mcp:azsdk_package_update_changelog_content` | Update changelog                                       |
| `azure-sdk-mcp:azsdk_package_update_metadata`          | Update metadata including ci.yml                       |
| `azure-sdk-mcp:azsdk_package_update_version`           | Update version                                         |

Prerequisites: azure-sdk-mcp server must be running. Without MCP, use `npx tsp-client` CLI.

## Steps

1. **Select language** — Confirm target language: .NET, Java, JavaScript, Python, Go, or Rust.
2. **Verify repo** — Ensure the user has a local clone of the correct [SDK repo](references/sdk-repos.md). If not cloned, instruct user to clone it.
3. **Identify config file** — Determine the path to the TypeSpec configuration file. See [config file details](references/detailed-workflow.md).
   - From `azure-rest-api-specs` repo: use path to `tspconfig.yaml`.
   - From an SDK language repo: use path to `tsp-location.yaml`.
4. **Verify setup** — Run `azure-sdk-mcp:azsdk_verify_setup` to confirm environment.
5. **Generate** — Run `azure-sdk-mcp:azsdk_package_generate_code` with the config file path. If compatibility review is requested or breaks are reported, hand off to `azsdk-common-sdk-breaking-change` for detection and user-selected mitigation before resuming the ordinary validation steps.
6. **Build** — Run `azure-sdk-mcp:azsdk_package_build_code`. If build succeeds, proceed to step 8.
7. **Customize** — For non-compatibility build failures or ordinary SDK modifications, run `azure-sdk-mcp:azsdk_customized_code_update` with the build errors or user request. The tool classifies the issue, applies authorized TypeSpec decorators and/or code patches, regenerates the SDK, and builds. Compatibility changes instead follow `azsdk-common-sdk-breaking-change`. See [customization workflow](references/customization-workflow.md).
8. **Commit checkpoint** — Prompt the user to commit generated changes before proceeding. See [commit checkpoint details](references/detailed-workflow.md).
9. **Validate** — Run `azure-sdk-mcp:azsdk_package_run_check` and `azure-sdk-mcp:azsdk_package_run_tests`.
10. **Metadata** — Run `azure-sdk-mcp:azsdk_package_update_changelog_content`, `azure-sdk-mcp:azsdk_package_update_metadata`, and `azure-sdk-mcp:azsdk_package_update_version`. _(Note: For .NET data plane, skip this step — metadata, changelog, and version updates are per-commit tasks, not part of the generate/build/test workflow.)_
11. **Final commit** — Prompt the user to commit final changes (changelog, metadata, version). See [commit checkpoint details](references/detailed-workflow.md).

[SDK repos](references/sdk-repos.md) | [Customization workflow](references/customization-workflow.md) | [Detailed workflow](references/detailed-workflow.md)

## Guardrails

- **NEVER modify generated SDK code files directly for customizations.** Use `azure-sdk-mcp:azsdk_customized_code_update` for ordinary TypeSpec/custom-code requests; use `azsdk-common-sdk-breaking-change` to select the supported mitigation route for compatibility changes.
- If `azure-sdk-mcp:azsdk_customized_code_update` fails or times out, **report the error to the user** and suggest retrying. Do not attempt to replicate its behavior by editing files manually.
- For ordinary customizations, the tool maintains the TypeSpec/custom-code layering and regeneration consistency.

## Examples

- "Generate the SDK locally for my TypeSpec service"
- "Build and test the Python SDK package"
- "Run CI checks for my SDK package"
- "Fix the SDK build errors on this PR"
- "The SDK generation has breaking changes, resolve them"
- "Rename FooClient to BarClient for .NET"
- "Hide the internal polling operation from the Python SDK"
- "Fix .NET analyzer errors AZC0030 and AZC0012"
- "The build is failing because a customization references a renamed property"
- "Create a subclient architecture for the Python SDK"
- "Apply TypeSpec customizations to fix compilation errors"
- "Update the changelog for this SDK package"
- "Update the package version"
- "Update the package metadata and ci.yml"

## Troubleshooting

- For "generate SDK for all languages", pipeline-based generation, or when no local SDK clone exists, call `azure-sdk-mcp:azsdk_run_generate_sdk` instead of the local generate flow, and never substitute `azure-sdk-mcp:azsdk_get_sdk_pull_request_link` / `azure-sdk-mcp:azsdk_get_pull_request` for generation.
- Run `azure-sdk-mcp:azsdk_verify_setup` to confirm MCP and tools.
- For breaking changes or ApiCompat diagnostics, use `azsdk-common-sdk-breaking-change`; do not automatically send every break to customization. For ordinary type conflicts, analyzer errors, or customization drift, use `azure-sdk-mcp:azsdk_customized_code_update`.
- The customization tool uses a two-phase approach: TypeSpec decorators first (Phase A), then code repairs if needed (Phase B).
- If `azure-sdk-mcp:azsdk_customized_code_update` fails or times out, report the error and retry. Do not manually edit generated SDK code — manual edits will be overwritten on the next regeneration.
- Without MCP, use `npx tsp-client` CLI.
