# Detailed Workflow

## Config File Identification

Determine the correct path to the TypeSpec configuration file based on the working context.

**Scenario A: Working in `azure-rest-api-specs`**

- Identify the path to `tspconfig.yaml` (local path or HTTPS URL).
- The local folder name can be arbitrary; MCP validates that the remote origin points to the official repo.
- Example paths:
  - `/home/usr/azure-rest-api-specs/specification/contosowidgetmanager/Contoso.Management/tspconfig.yaml`
  - `https://github.com/Azure/azure-rest-api-specs/blob/main/specification/contosowidgetmanager/Contoso.Management/tspconfig.yaml`

**Scenario B: Working in an Azure SDK language repo**

- Identify the path to `tsp-location.yaml`.
- Example: `/home/usr/azure-sdk-for-net/sdk/contoso/Azure.ResourceManager.Contoso/tsp-location.yaml`

## Compatibility Checkpoint

Use `azsdk-common-sdk-breaking-change` when the user requests compatibility review
or generation/CI reports breaking changes. The same workflow applies to spec PRs
and SDK PRs: generate when needed, detect against the normal latest-GA baseline,
show all changes and diagnostics, and obtain selected mitigations.

For .NET, detection on current artifacts is separate from compilation/analyzer
success. Missing or stale artifacts block a conclusion; a failed build must not
discard valid compatibility evidence. After mitigation, refresh affected
artifacts, rerun detection, then perform ordinary build/check/tests.

Spec-owned `client.tsp` changes require the authorized spec workspace. SDK-only
customization must preserve spec inputs and the `tsp-location.yaml` commit;
`SpecChangeRequired` returns to the spec owner rather than widening edit scope.
Return the evidence to the user without automatically posting PR comments or
approvals.

## Commit Checkpoints

There are two commit checkpoints in the workflow. At each one:

1. Inform the user that the preceding steps completed successfully.
2. **Prompt the user** to decide whether to commit now. Do NOT skip this prompt.
3. If user chooses to commit:
   - Check if on the `main` branch. If so, prompt: _"You are currently on the main branch. Please create a new branch using `git checkout -b <branch-name>` before proceeding."_ Suggest a default branch name (e.g., `sdk/<service-name>/<package-name>`).
   - Stage changed files with `git add`.
   - Prompt for a commit message, then run `git commit -m "<message>"`.
4. If user skips, acknowledge and proceed.

**Checkpoint 1 (after step 7/8):** Commit generated + built SDK changes before running validation and tests.

**Checkpoint 2 (after step 10/11):** Commit changelog, metadata, and version updates.
