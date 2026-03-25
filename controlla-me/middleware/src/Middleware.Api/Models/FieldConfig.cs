using System.Text.Json.Serialization;

namespace Middleware.Api.Models;

public record FieldConfig
{
    [JsonPropertyName("type")]
    public string Type { get; init; } = "string";

    [JsonPropertyName("required")]
    public bool Required { get; init; } = false;

    [JsonPropertyName("description")]
    public string? Description { get; init; }

    [JsonPropertyName("default")]
    public object? Default { get; init; }

    [JsonPropertyName("pattern")]
    public string? Pattern { get; init; }

    [JsonPropertyName("min")]
    public double? Min { get; init; }

    [JsonPropertyName("max")]
    public double? Max { get; init; }

    [JsonPropertyName("min_length")]
    public int? MinLength { get; init; }

    [JsonPropertyName("max_length")]
    public int? MaxLength { get; init; }

    [JsonPropertyName("enum")]
    public List<string>? Enum { get; init; }

    [JsonPropertyName("format")]
    public string? Format { get; init; }

    [JsonPropertyName("items")]
    public FieldConfig? Items { get; init; }
}
