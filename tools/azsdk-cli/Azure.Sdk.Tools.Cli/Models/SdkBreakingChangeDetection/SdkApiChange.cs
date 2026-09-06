// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Text.Json.Serialization;

namespace Azure.Sdk.Tools.Cli.Models.SdkBreakingChangeDetection;

/// <summary>
/// An API change and the compatibility diagnostic, if any, that identifies it.
/// Additions are supplementary evidence and are not inherently compatible or breaking.
/// </summary>
public class SdkApiChange
{
    [JsonPropertyName("kind")]
    public string Kind { get; set; } = string.Empty;

    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("isBreaking")]
    public bool IsBreaking { get; set; }

    [JsonPropertyName("diagnosticId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DiagnosticId { get; set; }

    [JsonPropertyName("targetFramework")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TargetFramework { get; set; }
}
