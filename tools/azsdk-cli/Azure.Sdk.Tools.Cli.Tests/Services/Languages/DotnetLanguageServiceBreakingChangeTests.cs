// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Text.Json;
using Azure.Sdk.Tools.Cli.CopilotAgents;
using Azure.Sdk.Tools.Cli.Helpers;
using Azure.Sdk.Tools.Cli.Services;
using Azure.Sdk.Tools.Cli.Services.Languages;
using Azure.Sdk.Tools.Cli.Tests.TestHelpers;
using Moq;

namespace Azure.Sdk.Tools.Cli.Tests.Services.Languages;

[TestFixture]
public class DotnetLanguageServiceBreakingChangeTests
{
    private TempDirectory _tempDirectory = null!;
    private Mock<IProcessHelper> _processHelper = null!;
    private Mock<IPowershellHelper> _powershellHelper = null!;
    private Mock<IGitHelper> _gitHelper = null!;
    private Mock<ISpecGenSdkConfigHelper> _configHelper = null!;
    private Mock<ICommonValidationHelpers> _validationHelper = null!;
    private DotnetLanguageService _service = null!;
    private string _packagePath = null!;
    private string _scriptPath = null!;
    private string? _outputPath;

    [SetUp]
    public void SetUp()
    {
        _tempDirectory = TempDirectory.Create("dotnet sdk change tests");
        _packagePath = Path.Combine(_tempDirectory.DirectoryPath, "sdk", "test", "Azure.Test");
        Directory.CreateDirectory(_packagePath);
        _scriptPath = Path.Combine(_tempDirectory.DirectoryPath, "eng", "scripts", "compatibility", "Get-SdkChanges.ps1");
        Directory.CreateDirectory(Path.GetDirectoryName(_scriptPath)!);
        File.WriteAllText(_scriptPath, "# Test fixture; execution is mocked.");
        _outputPath = null;

        _processHelper = new Mock<IProcessHelper>(MockBehavior.Strict);
        _powershellHelper = new Mock<IPowershellHelper>(MockBehavior.Strict);
        _gitHelper = new Mock<IGitHelper>();
        _gitHelper.Setup(g => g.DiscoverRepoRootAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(_tempDirectory.DirectoryPath);
        _configHelper = new Mock<ISpecGenSdkConfigHelper>();
        _configHelper.Setup(c => c.GetSdkBreakingChangePatternFileConfigurationAsync(
                _tempDirectory.DirectoryPath, It.IsAny<CancellationToken>()))
            .ReturnsAsync(string.Empty);
        _validationHelper = new Mock<ICommonValidationHelpers>(MockBehavior.Strict);
        _service = new DotnetLanguageService(
            _processHelper.Object, _powershellHelper.Object, Mock.Of<ICopilotAgentRunner>(),
            _gitHelper.Object, new TestLogger<DotnetLanguageService>(), _validationHelper.Object,
            Mock.Of<IPackageInfoHelper>(), Mock.Of<IFileHelper>(), _configHelper.Object,
            Mock.Of<IChangelogHelper>());
    }

    [TearDown]
    public void TearDown()
    {
        if (_outputPath != null)
        {
            File.Delete(_outputPath);
        }
        _tempDirectory.Dispose();
    }

    [TestCase(true)]
    [TestCase(false)]
    public async Task GetSdkChanges_UsesStandaloneScriptAndPreservesResult(bool breaking)
    {
        ConfigureScript($$"""
            {
                "changes": "### Breaking Changes\n- CP0017: Parameter name changed",
                "hasBreakingChange": {{breaking.ToString().ToLowerInvariant()}},
                "details": {
                    "baselineVersion": "2.0.0",
                    "apiChanges": [{
                        "kind": "changed", "symbol": "Azure.Test.Client.Get(string)",
                        "description": "Parameter name changed", "isBreaking": {{breaking.ToString().ToLowerInvariant()}},
                        "diagnosticId": "CP0017", "targetFramework": "netstandard2.0"
                    }],
                    "diagnostics": ["CP0017: Parameter name changed"],
                    "limitations": ["A diagnostic alone does not establish its root cause."]
                }
            }
            """);

        var changes = await _service.GetSdkChangesAsync(_packagePath, CancellationToken.None);

        Assert.That(changes, Is.Not.Null);
        Assert.That(changes!.HasBreakingChange, Is.EqualTo(breaking));
        Assert.That(changes.Details!.BaselineVersion, Is.EqualTo("2.0.0"));
        Assert.That(changes.Details.ApiChanges.Single().DiagnosticId, Is.EqualTo("CP0017"));
        Assert.That(changes.Details.Diagnostics, Is.EqualTo(new[] { "CP0017: Parameter name changed" }));
        Assert.That(changes.Details.Limitations, Has.Count.EqualTo(1));
        Assert.That(File.Exists(_outputPath), Is.False);
        _processHelper.VerifyNoOtherCalls();
        _validationHelper.VerifyNoOtherCalls();
    }

    [TestCase("Azure.Test")]
    [TestCase("Azure.ResourceManager.Test")]
    public async Task GetSdkChanges_SupportsBothSdkPlanesWithoutInvokingBuildOrAnalyzers(string packageName)
    {
        _packagePath = Path.Combine(_tempDirectory.DirectoryPath, "sdk", "test", packageName);
        Directory.CreateDirectory(_packagePath);
        ConfigureScript("{\"changes\":\"### Features Added\\n- New model\",\"hasBreakingChange\":false}");

        var result = await _service.GetSdkChangesAsync(_packagePath, CancellationToken.None);

        Assert.That(result!.HasBreakingChange, Is.False);
        _powershellHelper.Verify(p => p.Run(It.Is<PowershellOptions>(o =>
            o.ScriptPath == _scriptPath &&
            o.WorkingDirectory == _tempDirectory.DirectoryPath &&
            o.Args.Contains(_packagePath) &&
            !o.Args.Contains("build") &&
            !o.Args.Contains("RunApiCompat")), It.IsAny<CancellationToken>()), Times.Once);
        _processHelper.VerifyNoOtherCalls();
        _validationHelper.VerifyNoOtherCalls();
    }

    [Test]
    public async Task GetSdkChanges_NoGaBaseline_PreservesExplicitLimitation()
    {
        ConfigureScript("""
            {
                "changes": "No GA release is available for comparison.",
                "hasBreakingChange": false,
                "details": {
                    "baselineVersion": null,
                    "apiChanges": [], "diagnostics": [],
                    "limitations": ["No GA baseline; compatibility was not evaluated."]
                }
            }
            """);

        var result = await _service.GetSdkChangesAsync(_packagePath, CancellationToken.None);

        Assert.That(result!.Details!.BaselineVersion, Is.Null);
        Assert.That(result.Details.Limitations.Single(), Does.Contain("not evaluated"));
    }

    [TestCase("Missing current assembly")]
    [TestCase("Current assembly is stale")]
    [TestCase("Could not load a reference assembly")]
    [TestCase("NuGet baseline download failed")]
    [TestCase("Unsupported ApiCompat diagnostic")]
    public void GetSdkChanges_DetectorFailuresCannotBecomeCleanReports(string diagnostic)
    {
        ConfigureScript("{\"changes\":\"\",\"hasBreakingChange\":false}", 1, diagnostic);

        var exception = Assert.ThrowsAsync<InvalidOperationException>(() =>
            _service.GetSdkChangesAsync(_packagePath, CancellationToken.None));

        Assert.That(exception!.Message, Does.Contain(diagnostic));
        Assert.That(File.Exists(_outputPath), Is.False);
        _processHelper.VerifyNoOtherCalls();
    }

    [TestCase("not json")]
    [TestCase("null")]
    [TestCase("{}")]
    [TestCase("{\"changes\":\"text\"}")]
    [TestCase("{\"changes\":null,\"hasBreakingChange\":false}")]
    [TestCase("{\"changes\":\"\",\"hasBreakingChange\":true}")]
    public void GetSdkChanges_InvalidReportFailsAndIsCleaned(string report)
    {
        ConfigureScript(report);

        Assert.ThrowsAsync<JsonException>(() => _service.GetSdkChangesAsync(_packagePath, CancellationToken.None));

        Assert.That(File.Exists(_outputPath), Is.False);
    }

    [Test]
    public void GetSdkChanges_MissingReportFails()
    {
        ConfigureScript(null);

        Assert.ThrowsAsync<FileNotFoundException>(() => _service.GetSdkChangesAsync(_packagePath, CancellationToken.None));
    }

    [Test]
    public void GetSdkChanges_MissingScriptExplainsRepositoryRequirement()
    {
        File.Delete(_scriptPath);

        var exception = Assert.ThrowsAsync<FileNotFoundException>(() =>
            _service.GetSdkChangesAsync(_packagePath, CancellationToken.None));

        Assert.That(exception!.Message, Does.Contain("Update the SDK repository"));
        _powershellHelper.VerifyNoOtherCalls();
        _processHelper.VerifyNoOtherCalls();
    }

    [Test]
    public void GetSdkChanges_MissingRepositoryFails()
    {
        _gitHelper.Setup(g => g.DiscoverRepoRootAsync(_packagePath, It.IsAny<CancellationToken>()))
            .ReturnsAsync(string.Empty);

        Assert.ThrowsAsync<InvalidOperationException>(() =>
            _service.GetSdkChangesAsync(_packagePath, CancellationToken.None));
        _powershellHelper.VerifyNoOtherCalls();
    }

    [Test]
    public void GetSdkChanges_CancellationPropagatesAndCleansPartialReport()
    {
        using var cts = new CancellationTokenSource();
        _powershellHelper.Setup(p => p.Run(It.IsAny<PowershellOptions>(), cts.Token))
            .Callback<PowershellOptions, CancellationToken>((options, _) =>
            {
                CaptureOutputPath(options);
                File.WriteAllText(_outputPath!, "{}");
                cts.Cancel();
            })
            .ThrowsAsync(new OperationCanceledException(cts.Token));

        Assert.ThrowsAsync<OperationCanceledException>(() => _service.GetSdkChangesAsync(_packagePath, cts.Token));

        Assert.That(File.Exists(_outputPath), Is.False);
    }

    [TestCase("")]
    [TestCase("doc/custom-patterns.md")]
    public async Task GetSdkBreakingPattern_LoadsRepositoryCatalog(string configuredPath)
    {
        _configHelper.Setup(c => c.GetSdkBreakingChangePatternFileConfigurationAsync(
                _tempDirectory.DirectoryPath, It.IsAny<CancellationToken>()))
            .ReturnsAsync(configuredPath);
        var path = Path.Combine(_tempDirectory.DirectoryPath, string.IsNullOrEmpty(configuredPath)
            ? Path.Combine("doc", "dev", "SDKBreakingChanges.md")
            : configuredPath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllTextAsync(path, "CP0017: verified parameter-name pattern; client customization.");

        var patterns = await _service.GetSdkBreakingPattern(_tempDirectory.DirectoryPath, CancellationToken.None);

        Assert.That(patterns, Does.Contain("CP0017"));
        Assert.That(patterns, Does.Contain("client customization"));
    }

    [Test]
    public void GetSdkBreakingPattern_MissingCatalogIsExplicitFailure()
    {
        Assert.ThrowsAsync<DirectoryNotFoundException>(() =>
            _service.GetSdkBreakingPattern(_tempDirectory.DirectoryPath, CancellationToken.None));
    }

    private void ConfigureScript(string? report, int exitCode = 0, string output = "")
    {
        _powershellHelper.Setup(p => p.Run(It.IsAny<PowershellOptions>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PowershellOptions options, CancellationToken _) =>
            {
                CaptureOutputPath(options);
                if (report != null)
                {
                    File.WriteAllText(_outputPath!, report);
                }
                var result = new ProcessResult { ExitCode = exitCode };
                result.AppendStdout(output);
                return result;
            });
    }

    private void CaptureOutputPath(PowershellOptions options)
    {
        Assert.That(options.ScriptPath, Is.EqualTo(_scriptPath));
        Assert.That(options.Args[options.Args.IndexOf("-PackagePath") + 1], Is.EqualTo(Path.GetFullPath(_packagePath)));
        Assert.That(options.Args[options.Args.IndexOf("-SdkRepoPath") + 1], Is.EqualTo(_tempDirectory.DirectoryPath));
        _outputPath = options.Args[options.Args.IndexOf("-OutputJsonFile") + 1];
        Assert.That(Path.IsPathFullyQualified(_outputPath), Is.True);
    }
}
