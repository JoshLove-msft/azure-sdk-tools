// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Text.Json;
using Azure.Sdk.Tools.Cli.CopilotAgents;
using Azure.Sdk.Tools.Cli.Models.SdkBreakingChangeDetection;
using Azure.Sdk.Tools.Cli.Prompts.Templates;
using Azure.Sdk.Tools.Cli.Services;
using Azure.Sdk.Tools.Cli.Tests.TestHelpers;
using Moq;

namespace Azure.Sdk.Tools.Cli.Tests.Services;

[TestFixture]
public class DotnetBreakingChangeClassificationTests
{
    private Mock<ICopilotAgentRunner> _agentRunner = null!;
    private SdkBreakingChangeClassificationService _service = null!;

    [SetUp]
    public void SetUp()
    {
        _agentRunner = new Mock<ICopilotAgentRunner>();
        _service = new SdkBreakingChangeClassificationService(
            _agentRunner.Object, new TestLogger<SdkBreakingChangeClassificationService>());
    }

    [TestCase("generator", SdkBreakingChangeMitigation.Generator)]
    [TestCase("client customization", SdkBreakingChangeMitigation.ClientCustomization)]
    [TestCase("manual", SdkBreakingChangeMitigation.Manual)]
    public async Task Classify_PreservesSupportedMitigationRoute(string route, SdkBreakingChangeMitigation expected)
    {
        ConfigureResponse($$"""
            {
                "hasBreakingChange": true,
                "breakingChanges": [{
                    "breakingChange": "Widget.Name changed",
                    "category": "emitter change",
                    "resolution": "Follow the verified pattern and request user selection.",
                    "mitigation": "{{route}}",
                    "originBreaks": ["CP0002: Widget.Name was removed"]
                }]
            }
            """);

        var result = await _service.ClassifySdkBreakingChangesAsync(
            "### Breaking Changes\n- CP0002: Widget.Name was removed", "Verified patterns", "DotNet", null, CancellationToken.None);

        Assert.That(result, Is.Not.Null);
        Assert.That(result!.BreakingChanges.Single().Mitigation, Is.EqualTo(expected));
        Assert.That(result.BreakingChanges.Single().OriginBreaks, Is.EqualTo(new[] { "CP0002: Widget.Name was removed" }));
        Assert.That(JsonSerializer.Serialize(result), Does.Contain($"\"mitigation\":\"{route}\""));
    }

    [TestCase("")]
    [TestCase(", \"mitigation\": null")]
    [TestCase(", \"mitigation\": \"suppress\"")]
    [TestCase(", \"mitigation\": \"999\"")]
    public async Task Classify_RejectsMissingOrUnsupportedDotnetRoute(string mitigationProperty)
    {
        ConfigureResponse($$"""
            {
                "hasBreakingChange": true,
                "breakingChanges": [{
                    "breakingChange": "Widget removed",
                    "category": "unknown"
                    {{mitigationProperty}}
                }]
            }
            """);

        var result = await _service.ClassifySdkBreakingChangesAsync(
            "### Breaking Changes\n- Widget removed", "Patterns", "DotNet", null, CancellationToken.None);

        Assert.That(result, Is.Null, "Invalid routing must not authorize an automatic mitigation.");
    }

    [TestCase("Go")]
    [TestCase("Java")]
    [TestCase("Python")]
    [TestCase("JavaScript")]
    public async Task Classify_OtherLanguagesRetainExistingContract(string language)
    {
        ConfigureResponse("""
            {
                "hasBreakingChange": true,
                "breakingChanges": [{
                    "breakingChange": "Widget removed",
                    "category": "unknown",
                    "originBreaks": ["Widget removed"]
                }]
            }
            """);

        var result = await _service.ClassifySdkBreakingChangesAsync(
            "### Breaking Changes\n- Widget removed", "Patterns", language, null, CancellationToken.None);

        Assert.That(result, Is.Not.Null);
        Assert.That(result!.BreakingChanges.Single().Mitigation, Is.Null);
        Assert.That(JsonSerializer.Serialize(result), Does.Not.Contain("\"mitigation\""));
    }

    [TestCase(".NET")]
    [TestCase("DotNet")]
    [TestCase("csharp")]
    [TestCase("c#")]
    public void DotnetPrompt_RequiresConservativeEvidenceBasedRouting(string language)
    {
        var prompt = new SdkBreakingChangeClassificationTemplate(
            "Pattern catalog", "Original ApiCompat diagnostics", language, null).BuildPrompt();

        Assert.Multiple(() =>
        {
            Assert.That(prompt, Does.Contain("ApiCompat's forward comparison"));
            Assert.That(prompt, Does.Contain("not proof of a rename"));
            Assert.That(prompt, Does.Not.Contain("treat the combined evidence as a likely model rename"));
            Assert.That(prompt, Does.Contain("reverse-comparison diagnostics are supplementary evidence"));
            Assert.That(prompt, Does.Contain("mitigate-breaking-changes skill"));
            Assert.That(prompt, Does.Contain("azsdk_customized_code_update"));
            Assert.That(prompt, Does.Contain("Use \"manual\" for ambiguous mappings"));
            Assert.That(prompt, Does.Contain("Never apply fixes, edit generated code, add suppressions"));
            Assert.That(prompt, Does.Contain("Original ApiCompat diagnostics"));
            Assert.That(prompt, Does.Contain("Pattern catalog"));
        });
    }

    [Test]
    public void OtherLanguagePrompt_DoesNotRequireDotnetMitigation()
    {
        var prompt = new SdkBreakingChangeClassificationTemplate("Patterns", "Changes", "Go", null).BuildPrompt();

        Assert.That(prompt, Does.Not.Contain(".NET compatibility and mitigation"));
        Assert.That(prompt, Does.Not.Contain("mitigate-breaking-changes skill"));
        Assert.That(prompt, Does.Contain("treat the combined evidence as a likely model rename"));
    }

    [Test]
    public async Task Classify_UsesReadOnlyAgentAndPassesOriginalEvidence()
    {
        ConfigureResponse("{\"hasBreakingChange\":false,\"breakingChanges\":[]}");

        await _service.ClassifySdkBreakingChangesAsync(
            "Original compatibility output", "Original pattern catalog", "DotNet", null, CancellationToken.None);

        _agentRunner.Verify(r => r.RunAsync(It.Is<CopilotAgent<string>>(agent =>
            agent.Instructions.Contains("Original compatibility output") &&
            agent.Instructions.Contains("Original pattern catalog") &&
            !agent.Tools.Any()), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Test]
    public void Classify_PropagatesCancellation()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        _agentRunner.Setup(r => r.RunAsync(It.IsAny<CopilotAgent<string>>(), cts.Token))
            .ThrowsAsync(new OperationCanceledException(cts.Token));

        Assert.ThrowsAsync<OperationCanceledException>(() => _service.ClassifySdkBreakingChangesAsync(
            "Changes", "Patterns", "DotNet", null, cts.Token));
    }

    private void ConfigureResponse(string response)
    {
        _agentRunner.Setup(r => r.RunAsync(It.IsAny<CopilotAgent<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(response);
    }
}
