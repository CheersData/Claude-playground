using System.Text.Json.Serialization;

namespace Middleware.Api.Models;

public record InputConfig
{
    [JsonPropertyName("content_type")]
    public string ContentType { get; init; } = "application/json";

    [JsonPropertyName("fields")]
    public Dictionary<string, FieldConfig> Fields { get; init; } = new();

    [JsonPropertyName("validators")]
    public List<CrossFieldValidator> Validators { get; init; } = new();
}

public record CrossFieldValidator
{
    [JsonPropertyName("type")]
    public string Type { get; init; } = "";

    [JsonPropertyName("fields")]
    public List<string> Fields { get; init; } = new();

    [JsonPropertyName("message")]
    public string? Message { get; init; }
}
