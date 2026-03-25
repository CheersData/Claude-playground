using System.Text.Json.Serialization;

namespace Middleware.Api.Models;

public record ResponseConfig
{
    [JsonPropertyName("extract")]
    public Dictionary<string, string> Extract { get; init; } = new();

    [JsonPropertyName("static_fields")]
    public Dictionary<string, object> StaticFields { get; init; } = new();

    [JsonPropertyName("forward_status")]
    public bool ForwardStatus { get; init; } = false;

    [JsonPropertyName("on_error")]
    public ErrorResponseConfig OnError { get; init; } = new();
}

public record ErrorResponseConfig
{
    [JsonPropertyName("include_target_error")]
    public bool IncludeTargetError { get; init; } = false;

    [JsonPropertyName("default_message")]
    public string DefaultMessage { get; init; } = "An error occurred processing your request.";
}
