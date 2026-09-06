# Spec generation SDK automation

## Optional SDK change detection

SDK repositories can opt into the common SDK change detector through
`packageOptions.getSdkChangesScript` in their configured `eng/swagger_to_sdk_config.json`:

```json
{
  "packageOptions": {
    "getSdkChangesScript": {
      "path": "eng/scripts/Get-Sdk-Changes.ps1"
    }
  }
}
```

`path` identifies a PowerShell script relative to the SDK repository (absolute
paths also work). Automation passes `-SdkRepoPath`, `-PackagePath`, and
`-OutputJsonFile` as named parameters. Alternatively, configure `command`:

```json
{
  "packageOptions": {
    "getSdkChangesScript": {
      "command": "node \"{SdkRepoPath}/eng/scripts/get-sdk-changes.js\" --package \"{PackagePath}\" --output \"{OutputJsonFile}\""
    }
  }
}
```

As in `azsdk_package_detect_breaking_change`, `command` takes precedence over
`path`. Commands support quoted arguments and case-insensitive `{SdkRepoPath}`,
`{PackagePath}`, and `{OutputJsonFile}` placeholders. They are executed directly,
not through a shell. All three paths are absolute and the working directory is
the package directory. Generation output must identify the package name and folder.

The detector runs after the existing build/changelog steps for every configured
SDK language, even when compilation, analyzers, or generation have already
marked the package as failed. A successful detection does not clear those
failures. Repositories without this option retain their existing workflow.

For .NET, `Invoke-GenerateAndBuildV2.ps1` retains named package results when a
normal build or validation fails, reporting those packages as `warning`.
These packages, and named `failed` packages from generation, still reach the
detector. This does not bypass failures that prevent a valid `generateOutput.json`
from being written or leave only anonymous package entries: those upstream
failures prevent package selection. The .NET detector also requires usable
current assemblies and rejects missing or stale artifacts; this workflow does
not guarantee that a failed compilation produced an assembly.

The process must exit successfully and write a JSON object to `OutputJsonFile`:

```json
{
  "changes": "### Breaking Changes\n\n- Removed an API.\n\n### Features Added\n\n- Added an API.\n",
  "hasBreakingChange": true
}
```

Both fields are required with exactly these types; values are not coerced or
defaulted. Additional structured fields, such as ApiCompat diagnostics and API
change details, are preserved without interpretation. Detection errors must use
a nonzero exit code. Nonzero exits, configured script-error log matches, missing
files, and invalid output fail the package, never imply a clean compatibility
result, and do not erase previously detected breaks. On failure the breaking
flag remains unknown unless a previous step already detected breaks.

.NET can additionally return an opaque `details` object containing
`baselineVersion`, an `apiChanges` array, and `diagnostics` and `limitations`
arrays. Each API change contains `kind`, `symbol`, `description`, and
`isBreaking`, with optional `diagnosticId` and `targetFramework`. This object
remains nested under `details` in the raw artifact and the reported
`sdkChanges`; automation does not classify it or derive the common breaking
flag from its per-change flags. The required top-level `changes` and
`hasBreakingChange` contract is unchanged.

Each attempt gets a fresh directory under `out/stagedArtifacts/sdk-changes`.
Raw output is retained, including malformed or failed-process output when
available. Package execution reports expose `sdkChanges` for validated results
and `sdkChangesArtifactPath` for available raw output. Detector output is not
included in the SDK binaries or installation instructions. Markdown is merged
with existing changelogs without repeating identical entries and included in
the package summary and filtered report.

Entries under `Breaking Changes` participate in the existing
`sdk-suppressions.yaml` matching alongside previously detected changes.
Unenumerated breaks remain explicitly unsuppressed. Existing beta-management,
data-plane, status, and label policies still apply. In particular, this
integration does not invent .NET approval/suppression labels or change the
existing .NET label mapping.

The language repository owns the detector implementation and its configuration.
For .NET this is the ApiCompat adapter; this headless workflow neither performs
compatibility analysis itself nor invokes an LLM. Raw markdown and structured
data remain available for later common classification and mitigation.

## Focused development commands

Use the existing npm dependencies and Vitest runner:

```powershell
npm test -- test\automation\sdkChanges.test.ts test\utils\sdkChanges.test.ts test\types\SdkChanges.test.ts test\automation\workflowPackage.test.ts test\automation\reportStatus.test.ts test\utils\runScript.test.ts test\utils\handleSuppressionLines.test.ts test\types\PackageData.test.ts test\utils\reportStatusUtils.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
```
