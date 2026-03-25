using System.Text.Json.Serialization;

namespace Middleware.Api.Models;

public record MiddlewareConfig
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = "";

    [JsonPropertyName("slug")]
    public string Slug { get; init; } = "";

    [JsonPropertyName("name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("version")]
    public string Version { get; init; } = "1.0.0";

    [JsonPropertyName("enabled")]
    public bool Enabled { get; init; } = true;

    [JsonPropertyName("endpoint")]
    public EndpointConfig Endpoint { get; init; } = new();

    [JsonPropertyName("auth")]
    public AuthConfig Auth { get; init; } = new();

    [JsonPropertyName("input")]
    public InputConfig Input { get; init; } = new();

    [JsonPropertyName("target")]
    public TargetConfig Target { get; init; } = new();

    [JsonPropertyName("mapping")]
    public MappingConfig Mapping { get; init; } = new();

    [JsonPropertyName("response")]
    public ResponseConfig Response { get; init; } = new();
}

public record MappingConfig
{
    [JsonPropertyName("headers")]
    public Dictionary<string, MappingNode> Headers { get; init; } = new();

    [JsonPropertyName("query")]
    public Dictionary<string, MappingNode> Query { get; init; } = new();

    [JsonPropertyName("body")]
    public Dictionary<string, MappingNode> Body { get; init; } = new();
}
