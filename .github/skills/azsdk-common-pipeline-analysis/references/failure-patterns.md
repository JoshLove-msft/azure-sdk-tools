# Pipeline Failure Patterns and Resolution

## Test Failures

| Pattern                                  | Likely Cause                                       | Fix                                                                                                                                                            |
| ---------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AssertionError (expected vs actual)      | Logic bug or unintended behavior change            | Fix the code logic or update expected value if change was intentional                                                                                          |
| Recording file path does not exist       | Missing test recording for a new/modified test     | Best effort: use the `az` CLI to check auth (try `az account show`); if authenticated, run tests in record mode; else skip and report re-recording is required |
| Playback failure / ResourceNotFoundError | Recorded responses don't match current API calls   | Best effort: use the `az` CLI to check auth (try `az account show`); if authenticated, re-record the session; else skip and report re-recording is required    |
| HttpResponseError (5xx) in live tests    | Service-side issue during live test run            | Infrastructure - retry the pipeline                                                                                                                            |
| Timeout / test hung                      | Async issue, deadlock, or slow external dependency | Add timeout, fix async logic, or mock the slow dependency                                                                                                      |
| FileNotFoundError / missing fixture      | Test data not committed or path changed            | Add the fixture file or fix the path reference                                                                                                                 |

## Build/Compilation Failures

| Pattern                               | Likely Cause                                             | Fix                                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Type mismatch (mypy, pyright, tsc)    | Code passes wrong type to a function/constructor         | Fix the type at the cited file:line                                                                                                     |
| Missing import / unresolved reference | New dependency not imported, or missing from the project | Add the import; if the package isn't a declared dependency, add it to the project manifest (e.g. pyproject.toml, .csproj, package.json) |
| Incompatible type in generics         | Generic type parameter doesn't satisfy constraint        | Fix the type parameter or constraint                                                                                                    |
| Syntax error                          | Malformed code                                           | Fix the syntax at the cited line                                                                                                        |
| Missing types/models (TypeSpec)       | TypeSpec compilation issue                               | Fix TypeSpec definition, regenerate                                                                                                     |

## Validation/Lint Failures

| Pattern                        | Likely Cause                         | Fix                                                |
| ------------------------------ | ------------------------------------ | -------------------------------------------------- |
| Changelog validation error     | Missing or malformed changelog entry | Update CHANGELOG.md content                        |
| Breaking change detected       | API surface changed incompatibly     | Preserve evidence; use `azsdk-common-sdk-breaking-change` for user-selected mitigation |
| Lint/format violation          | Code doesn't match style rules       | Run the formatter (black, prettier, dotnet format) |
| API compatibility check failed | Public API signature changed         | Diagnose separately from build/analyzer failures using `azsdk-common-sdk-breaking-change` |

## Infrastructure Failures (Recommend Retry)

| Pattern                             | Likely Cause                            | Action         |
| ----------------------------------- | --------------------------------------- | -------------- |
| Name or service not known (DNS)     | Transient network issue                 | Retry pipeline |
| HTTP 429 / rate limited             | Throttling from package registry or API | Wait and retry |
| Agent disconnected / process killed | CI agent resource exhaustion            | Retry pipeline |
| Timeout downloading packages        | Network congestion or registry slowness | Retry pipeline |
| Certificate / SSL error             | Transient PKI issue                     | Retry pipeline |

## Cascading Failure Detection

When many tests fail simultaneously, look for:

- A single build/setup step that failed (all downstream tests fail with import errors)
- A shared test fixture or setup method that throws
- A missing environment variable or config file
- A dependency that failed to install

**Rule of thumb:** If >10 tests fail with similar error patterns, identify the common root cause rather than fixing each individually.

## TypeSpec/SDK Generation Failures

| Pattern                          | Likely Cause                        | Fix                                   |
| -------------------------------- | ----------------------------------- | ------------------------------------- |
| Missing client.tsp changes       | TypeSpec customization needed       | Use `azsdk_customized_code_update`    |
| tspconfig.yaml emitter error     | Incorrect emitter configuration     | Fix tspconfig.yaml                    |
| Breaking change in generated API | Generated surface differs from baseline; root cause needs evidence | Use `azsdk-common-sdk-breaking-change`; paired removals/additions do not prove a rename |

Compatibility diagnosis remains read-only. Report all changes, original
diagnostics, and root-cause confidence. A successful build/API review does not
establish compatibility, and a failed build must not hide valid current .NET
artifact evidence. Missing/stale artifacts or detection/classification errors
block a conclusion; never recommend suppressions or generated-source edits as
automatic fixes.
