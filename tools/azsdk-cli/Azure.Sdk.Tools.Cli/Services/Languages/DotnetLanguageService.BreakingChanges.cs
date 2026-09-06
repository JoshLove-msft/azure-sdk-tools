// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using Azure.Sdk.Tools.Cli.Helpers;
using Azure.Sdk.Tools.Cli.Models.SdkBreakingChangeDetection;

namespace Azure.Sdk.Tools.Cli.Services.Languages;

public sealed partial class DotnetLanguageService
{
    public override async Task<SdkChange?> GetSdkChangesAsync(string packagePath, CancellationToken ct)
    {
        var repoRoot = await gitHelper.DiscoverRepoRootAsync(packagePath, ct);
        if (string.IsNullOrWhiteSpace(repoRoot))
        {
            throw new InvalidOperationException($"Unable to find the .NET SDK repository containing '{packagePath}'.");
        }

        var scriptPath = Path.Combine(repoRoot, "eng", "scripts", "compatibility", "Get-SdkChanges.ps1");
        if (!File.Exists(scriptPath))
        {
            throw new FileNotFoundException(
                "The .NET SDK repository does not contain the standalone ApiCompat detector. Update the SDK repository to a version that includes eng/scripts/compatibility/Get-SdkChanges.ps1.",
                scriptPath);
        }

        var outputPath = Path.Combine(Path.GetTempPath(), $"dotnet-sdk-changes-{Guid.NewGuid():N}.json");
        try
        {
            var options = new PowershellOptions(
                scriptPath,
                ["-PackagePath", Path.GetFullPath(packagePath), "-SdkRepoPath", repoRoot, "-OutputJsonFile", outputPath],
                workingDirectory: repoRoot,
                timeout: TimeSpan.FromMinutes(5));
            var result = await powershellHelper.Run(options, ct);
            if (result.ExitCode != 0)
            {
                throw new InvalidOperationException($"The .NET ApiCompat detector failed (exit code {result.ExitCode}).{Environment.NewLine}{result.Output}");
            }
            if (!File.Exists(outputPath))
            {
                throw new FileNotFoundException("The .NET ApiCompat detector did not produce an SDK change report.", outputPath);
            }
            return await SdkChangeHelper.ReadFromFileAsync(outputPath, ct);
        }
        finally
        {
            File.Delete(outputPath);
        }
    }

    public override async Task<string> GetSdkBreakingPattern(string sdkRepoRoot, CancellationToken ct)
    {
        var configuredPath = await specGenSdkConfigHelper.GetSdkBreakingChangePatternFileConfigurationAsync(sdkRepoRoot, ct);
        var path = Path.Combine(sdkRepoRoot, string.IsNullOrWhiteSpace(configuredPath)
            ? Path.Combine("doc", "dev", "SDKBreakingChanges.md")
            : configuredPath);
        logger.LogInformation("Loading .NET SDK breaking change patterns from {Path}", path);
        return await File.ReadAllTextAsync(path, ct);
    }
}
