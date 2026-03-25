using System.Text.Json.Serialization;

namespace Middleware.Api.Models;

public record EndpointConfig
{
    [JsonPropertyName("path")]
    public string Path { get; init; } = "";

    [JsonPropertyName("method")]
    public string Method { get; init; } = "POST";

    [JsonPropertyName("description")]
    public string Description { get; init; } = "";

    [JsonPropertyName("rate_limit")]
    public RateLimitConfig? RateLimit { get; init; }
}

public record RateLimitConfig
{
    [JsonPropertyName("requests_per_minute")]
    public int RequestsPerMinute { get; init; } = 60;

    [JsonPropertyName("burst")]
    public int Burst { get; init; } = 10;
}
