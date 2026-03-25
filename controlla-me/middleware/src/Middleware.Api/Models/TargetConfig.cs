using System.Text.Json.Serialization;

namespace Middleware.Api.Models;

public record TargetConfig
{
    [JsonPropertyName("base_url")]
    public string BaseUrl { get; init; } = "";

    [JsonPropertyName("path")]
    public string Path { get; init; } = "";

    [JsonPropertyName("method")]
    public string Method { get; init; } = "POST";

    [JsonPropertyName("content_type")]
    public string ContentType { get; init; } = "application/json";

    [JsonPropertyName("timeout_ms")]
    public int TimeoutMs { get; init; } = 30000;

    [JsonPropertyName("retry")]
    public RetryConfig Retry { get; init; } = new();

    [JsonPropertyName("headers")]
    public Dictionary<string, string> Headers { get; init; } = new();
}

public record RetryConfig
{
    [JsonPropertyName("max_retries")]
    public int MaxRetries { get; init; } = 3;

    [JsonPropertyName("backoff_ms")]
    public int BackoffMs { get; init; } = 1000;

    [JsonPropertyName("backoff_multiplier")]
    public double BackoffMultiplier { get; init; } = 2.0;

    [JsonPropertyName("retry_on_status")]
    public List<int> RetryOnStatus { get; init; } = new() { 429, 500, 502, 503 };
}
