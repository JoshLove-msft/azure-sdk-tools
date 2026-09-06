// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

using System.Runtime.Serialization;
using System.Text.Json.Serialization;
using Azure.Sdk.Tools.Cli.Models.Serialization;

namespace Azure.Sdk.Tools.Cli.Models.SdkBreakingChangeDetection;

[JsonConverter(typeof(JsonStringEnumWithEnumMemberConverter<SdkBreakingChangeMitigation>))]
public enum SdkBreakingChangeMitigation
{
    [EnumMember(Value = "manual")]
    Manual,

    [EnumMember(Value = "generator")]
    Generator,

    [EnumMember(Value = "client customization")]
    ClientCustomization,
}
