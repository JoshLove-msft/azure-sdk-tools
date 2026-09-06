// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Text.Json;
using Azure.Sdk.Tools.Cli.Helpers;
using Azure.Sdk.Tools.Cli.Models;
using Azure.Sdk.Tools.Cli.Models.Responses.Package;
using Azure.Sdk.Tools.Cli.Models.SdkBreakingChangeDetection;
using Azure.Sdk.Tools.Cli.Services;
using Azure.Sdk.Tools.Cli.Services.Languages;
using Azure.Sdk.Tools.Cli.Tests.TestHelpers;
using Azure.Sdk.Tools.Cli.Tools.Package;
using Moq;

namespace Azure.Sdk.Tools.Cli.Tests.Tools.Package;

[TestFixture]
public class SdkBreakingChangeDetectToolTests
{
    private const string BreakingChanges = "### Breaking Changes\n\n- CP0002: Member 'Azure.Test.Widget.Name' was removed.\n\n### Features Added\n\n- Property 'Azure.Test.Widget.DisplayName' was added.";
    private const string Additions = "### Features Added\n\n- Property 'Azure.Test.Widget.DisplayName' was added.";
    private TempDirectory _tempDirectory = null!;
    private Mock<LanguageService> _languageService = null!;
    private Mock<IGitHelper> _gitHelper = null!;
    private Mock<ISpecGenSdkConfigHelper> _configHelper = null!;
    private Mock<ISdkBreakingChangeClassificationService> _classifier = null!;
    private SdkBreakingChangeDetectTool _tool = null!;
    private string _packagePath = null!;
    private string? _scriptOutputPath;
    private SdkChangeDetails? _details;

    [SetUp]
    public void SetUp()
    {
        _tempDirectory = TempDirectory.Create("sdk-breaking-change-tests");
        _packagePath = Path.Combine(_tempDirectory.DirectoryPath, "sdk", "test", "Azure.Test");
        Directory.CreateDirectory(_packagePath);
        _scriptOutputPath = null;
        _details = null;
        _languageService = new Mock<LanguageService> { CallBase = true };
        _languageService.SetupGet(s => s.Language).Returns(SdkLanguage.DotNet);
        _languageService.Setup(s => s.GetPackageInfo(_packagePath, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PackageInfo
            {
                PackageName = "Azure.Test",
                PackagePath = _packagePath,
                ServiceName = "test",
                Language = SdkLanguage.DotNet,
            });
        _languageService.Setup(s => s.GetSdkBreakingPattern(_tempDirectory.DirectoryPath, It.IsAny<CancellationToken>()))
            .ReturnsAsync("Verified .NET compatibility patterns");
        _gitHelper = new Mock<IGitHelper>();
        _gitHelper.Setup(g => g.GetRepoNameAsync(_packagePath, It.IsAny<CancellationToken>()))
            .ReturnsAsync("azure-sdk-for-net");
        _gitHelper.Setup(g => g.DiscoverRepoRootAsync(_packagePath, It.IsAny<CancellationToken>()))
            .ReturnsAsync(_tempDirectory.DirectoryPath);
        _configHelper = new Mock<ISpecGenSdkConfigHelper>();
        _configHelper.Setup(c => c.GetConfigurationAsync(_tempDirectory.DirectoryPath, SpecGenSdkConfigType.GetSdkChanges, It.IsAny<CancellationToken>()))
            .ReturnsAsync((SpecGenSdkConfigContentType.Unknown, string.Empty));
        _classifier = new Mock<ISdkBreakingChangeClassificationService>();
        _tool = new SdkBreakingChangeDetectTool(
            _gitHelper.Object,
            new TestLogger<SdkBreakingChangeDetectTool>(),
            [_languageService.Object],
            _configHelper.Object,
            _classifier.Object);
    }

    [TearDown]
    public void TearDown()
    {
        if (_scriptOutputPath != null)
        {
            File.Delete(_scriptOutputPath);
        }
        _tempDirectory.Dispose();
    }

    [TestCase(true)]
    [TestCase(false)]
    public async Task BuiltInDetector_ChangesOnly_PreservesChangesWithoutClassification(bool hasBreakingChange)
    {
        ConfigureBuiltInDetector(hasBreakingChange);

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath, changesOnly: true);

        Assert.That(response.ExitCode, Is.Zero);
        Assert.That(response.Language, Is.EqualTo(SdkLanguage.DotNet));
        var result = GetResult(response);
        Assert.That(result.HasBreakingChange, Is.EqualTo(hasBreakingChange));
        Assert.That(result.SdkChangeMD, Is.EqualTo(hasBreakingChange ? BreakingChanges : Additions));
        Assert.That(result.Details, Is.SameAs(_details));
        Assert.That(result.BreakingChanges, Is.Empty);
        _classifier.VerifyNoOtherCalls();
    }

    [Test]
    public async Task BuiltInDetector_BreakingChanges_UsesCommonClassificationAndPreservesEvidence()
    {
        ConfigureBuiltInDetector(true);
        var tspConfigPath = Path.Combine(_tempDirectory.DirectoryPath, "tspconfig.yaml");
        _classifier.Setup(c => c.ClassifySdkBreakingChangesAsync(
                BreakingChanges, "Verified .NET compatibility patterns", "DotNet",
                _tempDirectory.DirectoryPath, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SdkBreakingChangeDetectionResult
            {
                HasBreakingChange = true,
                SdkChangeMD = "Untrusted rewritten evidence",
                Details = new SdkChangeDetails { BaselineVersion = "invented" },
                BreakingChanges =
                [
                    new SdkBreakingChange
                    {
                        BreakingChange = "Widget.Name was removed; a possible rename requires review.",
                        Category = SdkBreakingChangeCategory.Unknown,
                        OriginBreaks = ["CP0002: Member 'Azure.Test.Widget.Name' was removed."],
                    },
                ],
            });

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath, tspConfigPath);

        Assert.That(response.ExitCode, Is.Zero);
        Assert.That(GetResult(response).SdkChangeMD, Is.EqualTo(BreakingChanges));
        Assert.That(GetResult(response).Details, Is.SameAs(_details));
        Assert.That(GetResult(response).BreakingChanges, Has.Count.EqualTo(1));
        _classifier.VerifyAll();
    }

    [Test]
    public async Task BuiltInDetector_NoBreaks_DoesNotInvokeClassifier()
    {
        ConfigureBuiltInDetector(false);

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath);

        Assert.That(response.ExitCode, Is.Zero);
        Assert.That(GetResult(response).HasBreakingChange, Is.False);
        _classifier.VerifyNoOtherCalls();
    }

    [Test]
    public async Task BuiltInDetector_NoGaBaseline_DoesNotClaimCompatibilityPass()
    {
        _languageService.Setup(s => s.GetSdkChangesAsync(_packagePath, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SdkChange
            {
                HasBreakingChange = false,
                SdkChangeMD = "No GA release.",
                Details = new SdkChangeDetails { Limitations = ["No GA baseline is available."] },
            });

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath);

        Assert.That(response.ExitCode, Is.Zero);
        Assert.That(response.Message, Does.Contain("compatibility was not evaluated"));
        Assert.That(GetResult(response).Details!.Limitations, Is.Not.Empty);
        _classifier.VerifyNoOtherCalls();
    }

    [Test]
    public async Task MissingPatternCatalog_PreservesDetectedCompatibilityEvidence()
    {
        ConfigureBuiltInDetector(true);
        _languageService.Setup(s => s.GetSdkBreakingPattern(_tempDirectory.DirectoryPath, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new FileNotFoundException("Pattern catalog is missing."));

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath);

        Assert.That(response.ExitCode, Is.Not.Zero);
        Assert.That(response.Language, Is.EqualTo(SdkLanguage.DotNet));
        Assert.That(GetResult(response).HasBreakingChange, Is.True);
        Assert.That(GetResult(response).Details, Is.SameAs(_details));
        Assert.That(GetResult(response).SdkChangeMD, Is.EqualTo(BreakingChanges));
        _classifier.VerifyNoOtherCalls();
    }

    [TestCase("null")]
    [TestCase("noBreaks")]
    [TestCase("empty")]
    public async Task ClassificationFailure_PreservesDetectedBreaks(string classification)
    {
        ConfigureBuiltInDetector(true);
        _classifier.Setup(c => c.ClassifySdkBreakingChangesAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(classification == "null" ? null : new SdkBreakingChangeDetectionResult
            {
                HasBreakingChange = classification != "noBreaks",
                BreakingChanges = [],
            });

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath);

        Assert.That(response.ExitCode, Is.Not.Zero);
        Assert.That(GetResult(response).HasBreakingChange, Is.True);
        Assert.That(GetResult(response).SdkChangeMD, Is.EqualTo(BreakingChanges));
        Assert.That(GetResult(response).Details, Is.SameAs(_details));
    }

    [TestCase(SdkLanguage.DotNet, "azure-sdk-for-net")]
    [TestCase(SdkLanguage.Go, "azure-sdk-for-go")]
    [TestCase(SdkLanguage.Java, "azure-sdk-for-java")]
    [TestCase(SdkLanguage.JavaScript, "azure-sdk-for-js")]
    [TestCase(SdkLanguage.Python, "azure-sdk-for-python")]
    public async Task ConfiguredScript_TakesPrecedenceAndCleansOutput(SdkLanguage language, string repoName)
    {
        _languageService.SetupGet(s => s.Language).Returns(language);
        _gitHelper.Setup(g => g.GetRepoNameAsync(_packagePath, It.IsAny<CancellationToken>())).ReturnsAsync(repoName);
        ConfigureScript(JsonSerializer.Serialize(new SdkChange { HasBreakingChange = true, SdkChangeMD = BreakingChanges }));

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath, changesOnly: true);

        Assert.That(response.ExitCode, Is.Zero);
        Assert.That(GetResult(response).HasBreakingChange, Is.True);
        Assert.That(GetResult(response).SdkChangeMD, Is.EqualTo(BreakingChanges));
        Assert.That(response.Language, Is.EqualTo(language));
        Assert.That(File.Exists(_scriptOutputPath), Is.False);
        _languageService.Verify(s => s.GetSdkChangesAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [TestCase("not json")]
    [TestCase("null")]
    [TestCase("{}")]
    [TestCase("{\"changes\":\"text\"}")]
    [TestCase("{\"hasBreakingChange\":false}")]
    [TestCase("{\"changes\":null,\"hasBreakingChange\":false}")]
    [TestCase("{\"changes\":\"\",\"hasBreakingChange\":true}")]
    [TestCase("{\"changes\":\"text\",\"hasBreakingChange\":\"false\"}")]
    public async Task InvalidScriptOutput_FailsWithoutFallbackAndCleansOutput(string output)
    {
        ConfigureScript(output);

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath);

        Assert.That(response.ExitCode, Is.Not.Zero);
        Assert.That(string.Join("\n", response.ResponseErrors), Does.Not.Contain("Object reference"));
        Assert.That(response.Result, Is.Not.InstanceOf<SdkBreakingChangeDetectionResult>());
        Assert.That(File.Exists(_scriptOutputPath), Is.False);
        _languageService.Verify(s => s.GetSdkChangesAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _classifier.VerifyNoOtherCalls();
    }

    [TestCase(false)]
    [TestCase(true)]
    public async Task ScriptFailure_PreservesErrorAndDoesNotConsumeOutput(bool singleError)
    {
        ConfigureScript("{\"changes\":\"\",\"hasBreakingChange\":false}", "ApiCompat could not resolve the baseline assembly.", singleError);

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath);

        Assert.That(string.Join("\n", response.ResponseErrors), Does.Contain("could not resolve the baseline assembly"));
        Assert.That(File.Exists(_scriptOutputPath), Is.False);
        _languageService.Verify(s => s.GetSdkChangesAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _classifier.VerifyNoOtherCalls();
    }

    [Test]
    public async Task MissingScriptOutput_FailsRatherThanReportingNoBreaks()
    {
        ConfigureScript(null);

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath);

        Assert.That(string.Join("\n", response.ResponseErrors), Does.Contain("did not produce its output"));
        Assert.That(response.Result, Is.Not.InstanceOf<SdkBreakingChangeDetectionResult>());
    }

    [Test]
    public async Task LocalReport_IsUsedWithoutRunningDetection()
    {
        var path = Path.Combine(_tempDirectory.DirectoryPath, "changes.json");
        await File.WriteAllTextAsync(path, "{\"changes\":\"### Features Added\\n- Widget\",\"hasBreakingChange\":false}");

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath, localSdkChangeJsonFilePath: path);

        Assert.That(response.ExitCode, Is.Zero);
        Assert.That(GetResult(response).SdkChangeMD, Does.Contain("Widget"));
        _configHelper.VerifyNoOtherCalls();
        _languageService.Verify(s => s.GetSdkChangesAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Test]
    public async Task LocalReport_PreservesStructuredDetailsInCommonJsonResult()
    {
        var path = Path.Combine(_tempDirectory.DirectoryPath, "changes.json");
        await File.WriteAllTextAsync(path, """
            {
                "changes": "### Features Added\n- Widget.DisplayName",
                "hasBreakingChange": false,
                "details": {
                    "baselineVersion": "1.2.3",
                    "apiChanges": [{
                        "kind": "added",
                        "symbol": "P:Azure.Test.Widget.DisplayName",
                        "description": "Property added",
                        "isBreaking": false,
                        "targetFramework": "netstandard2.0"
                    }],
                    "diagnostics": ["Original ApiCompat output"],
                    "limitations": ["Behavior changes require review."]
                }
            }
            """);

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath, localSdkChangeJsonFilePath: path);

        Assert.That(response.ExitCode, Is.Zero);
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(response));
        var details = document.RootElement.GetProperty("result").GetProperty("details");
        Assert.That(details.GetProperty("baselineVersion").GetString(), Is.EqualTo("1.2.3"));
        Assert.That(details.GetProperty("apiChanges")[0].GetProperty("symbol").GetString(), Is.EqualTo("P:Azure.Test.Widget.DisplayName"));
        Assert.That(details.GetProperty("diagnostics")[0].GetString(), Is.EqualTo("Original ApiCompat output"));
        Assert.That(details.GetProperty("limitations")[0].GetString(), Is.EqualTo("Behavior changes require review."));
    }

    [Test]
    public async Task InvalidLocalReport_DoesNotSilentlyReplaceEvidence()
    {
        var path = Path.Combine(_tempDirectory.DirectoryPath, "changes.json");
        await File.WriteAllTextAsync(path, "{}");

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath, localSdkChangeJsonFilePath: path);

        Assert.That(response.ExitCode, Is.Not.Zero);
        _configHelper.VerifyNoOtherCalls();
        _languageService.Verify(s => s.GetSdkChangesAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Test]
    public async Task ChangesOnly_IgnoresLocalReport()
    {
        ConfigureBuiltInDetector(true);
        var path = Path.Combine(_tempDirectory.DirectoryPath, "changes.json");
        await File.WriteAllTextAsync(path, "not json");

        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath, changesOnly: true, localSdkChangeJsonFilePath: path);

        Assert.That(response.ExitCode, Is.Zero);
        Assert.That(GetResult(response).HasBreakingChange, Is.True);
        _languageService.Verify(s => s.GetSdkChangesAsync(_packagePath, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Test]
    public async Task UnsupportedLanguage_StillReturnsExplicitFailure()
    {
        var response = await _tool.DetectSDKBreakingChangesAsync(_packagePath);

        Assert.That(response.ExitCode, Is.Not.Zero);
        Assert.That(response.ResponseError, Does.Contain("not implemented"));
        Assert.That(response.Result, Is.Not.InstanceOf<SdkBreakingChangeDetectionResult>());
    }

    [Test]
    public void Cancellation_IsNotConvertedIntoDetectionResult()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        _languageService.Setup(s => s.GetSdkChangesAsync(_packagePath, cts.Token))
            .ThrowsAsync(new OperationCanceledException(cts.Token));

        Assert.ThrowsAsync<OperationCanceledException>(() => _tool.DetectSDKBreakingChangesAsync(_packagePath, ct: cts.Token));
    }

    [Test]
    public void ScriptCancellation_CleansPartialReportEvenIfProcessHelperReturnsAnError()
    {
        using var cts = new CancellationTokenSource();
        ConfigureScript("{}");
        _configHelper.Setup(c => c.ExecuteProcessAsync(
                It.IsAny<ProcessOptions>(), cts.Token, It.IsAny<PackageInfo?>(),
                It.IsAny<string>(), It.IsAny<string[]?>()))
            .ReturnsAsync(() =>
            {
                File.WriteAllText(_scriptOutputPath!, "{}");
                cts.Cancel();
                return PackageOperationResponse.CreateFailure("Process was canceled.");
            });

        Assert.ThrowsAsync<OperationCanceledException>(() => _tool.DetectSDKBreakingChangesAsync(_packagePath, ct: cts.Token));

        Assert.That(File.Exists(_scriptOutputPath), Is.False);
        _classifier.VerifyNoOtherCalls();
    }

    private void ConfigureBuiltInDetector(bool hasBreakingChange)
    {
        _details = new SdkChangeDetails
        {
            BaselineVersion = "1.2.3",
            ApiChanges =
            [
                new SdkApiChange
                {
                    Kind = hasBreakingChange ? "removed" : "added",
                    Symbol = hasBreakingChange ? "P:Azure.Test.Widget.Name" : "P:Azure.Test.Widget.DisplayName",
                    Description = hasBreakingChange ? "Property removed" : "Property added",
                    DiagnosticId = hasBreakingChange ? "CP0002" : null,
                    TargetFramework = "netstandard2.0",
                    IsBreaking = hasBreakingChange,
                },
            ],
            Diagnostics = hasBreakingChange ? ["CP0002: Widget.Name was removed"] : [],
            Limitations = ["Potential renames require confirmation."],
        };
        _languageService.Setup(s => s.GetSdkChangesAsync(_packagePath, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SdkChange
            {
                HasBreakingChange = hasBreakingChange,
                SdkChangeMD = hasBreakingChange ? BreakingChanges : Additions,
                Details = _details,
            });
    }

    private void ConfigureScript(string? output, string? error = null, bool singleError = false)
    {
        _configHelper.Setup(c => c.GetConfigurationAsync(_tempDirectory.DirectoryPath, SpecGenSdkConfigType.GetSdkChanges, It.IsAny<CancellationToken>()))
            .ReturnsAsync((SpecGenSdkConfigContentType.ScriptPath, "eng/scripts/Get-SdkChanges.ps1"));
        _configHelper.Setup(c => c.CreateProcessOptions(
                SpecGenSdkConfigContentType.ScriptPath, "eng/scripts/Get-SdkChanges.ps1",
                _tempDirectory.DirectoryPath, _packagePath, It.IsAny<Dictionary<string, string>>(), 5))
            .Callback<SpecGenSdkConfigContentType, string, string, string, Dictionary<string, string>, int>(
                (_, _, _, _, parameters, _) =>
                {
                    Assert.That(parameters["SdkRepoPath"], Is.EqualTo(_tempDirectory.DirectoryPath));
                    Assert.That(parameters["PackagePath"], Is.EqualTo(_packagePath));
                    _scriptOutputPath = parameters["OutputJsonFile"];
                })
            .Returns(new ProcessOptions("pwsh", []));
        _configHelper.Setup(c => c.ExecuteProcessAsync(
                It.IsAny<ProcessOptions>(), It.IsAny<CancellationToken>(), It.IsAny<PackageInfo?>(),
                It.IsAny<string>(), It.IsAny<string[]?>()))
            .ReturnsAsync(() =>
            {
                if (output != null)
                {
                    File.WriteAllText(_scriptOutputPath!, output);
                }
                return error == null
                    ? new PackageOperationResponse()
                    : singleError ? new PackageOperationResponse { ResponseError = error } : PackageOperationResponse.CreateFailure(error);
            });
    }

    private static SdkBreakingChangeDetectionResult GetResult(PackageOperationResponse response)
    {
        Assert.That(response.Result, Is.TypeOf<SdkBreakingChangeDetectionResult>());
        return (SdkBreakingChangeDetectionResult)response.Result!;
    }
}
