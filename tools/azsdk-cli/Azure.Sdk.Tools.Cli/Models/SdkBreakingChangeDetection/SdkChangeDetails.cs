// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Text.Json.Serialization;

namespace Azure.Sdk.Tools.Cli.Models.SdkBreakingChangeDetection;

/// <summary>
/// Original detector evidence, preserved independently of AI classification.
/// </summary>
public class SdkChangeDetails
{
    [JsonPropertyName("baselineVersion")]
    public string? BaselineVersion { get; set; }

    [JsonPropertyName("apiChanges")]
    public List<SdkApiChange> ApiChanges { get; set; } = [];

    [JsonPropertyName("diagnostics")]
    public List<string> Diagnostics { get; set; } = [];

    [JsonPropertyName("limitations")]
    public List<string> Limitations { get; set; } = [];
}
