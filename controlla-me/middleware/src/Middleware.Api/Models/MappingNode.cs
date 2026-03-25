using System.Text.Json.Serialization;

namespace Middleware.Api.Models;

public record MappingNode
{
    [JsonPropertyName("source")]
    public string Source { get; init; } = "static";

    [JsonPropertyName("value")]
    public object? Value { get; init; }

    [JsonPropertyName("field")]
    public string? Field { get; init; }

    [JsonPropertyName("env")]
    public string? Env { get; init; }

    [JsonPropertyName("auth_field")]
    public string? AuthField { get; init; }

    [JsonPropertyName("template")]
    public string? Template { get; init; }

    [JsonPropertyName("transform")]
    public string? Transform { get; init; }

    [JsonPropertyName("conditions")]
    public List<ConditionNode>? Conditions { get; init; }

    [JsonPropertyName("default")]
    public object? Default { get; init; }

    [JsonPropertyName("children")]
    public Dictionary<string, MappingNode>? Children { get; init; }
}

public record ConditionNode
{
    [JsonPropertyName("field")]
    public string Field { get; init; } = "";

    [JsonPropertyName("operator")]
    public string Operator { get; init; } = "eq";

    [JsonPropertyName("value")]
    public object? Value { get; init; }

    [JsonPropertyName("then")]
    public object? Then { get; init; }
}
