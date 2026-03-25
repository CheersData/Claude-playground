using System.Text.Json.Serialization;

namespace Middleware.Api.Models;

public record AuthConfig
{
    [JsonPropertyName("type")]
    public string Type { get; init; } = "none";

    [JsonPropertyName("token_env")]
    public string? TokenEnv { get; init; }

    [JsonPropertyName("api_key_env")]
    public string? ApiKeyEnv { get; init; }

    [JsonPropertyName("api_key_header")]
    public string? ApiKeyHeader { get; init; }

    [JsonPropertyName("username_env")]
    public string? UsernameEnv { get; init; }

    [JsonPropertyName("password_env")]
    public string? PasswordEnv { get; init; }

    [JsonPropertyName("client_id_env")]
    public string? ClientIdEnv { get; init; }

    [JsonPropertyName("client_secret_env")]
    public string? ClientSecretEnv { get; init; }

    [JsonPropertyName("token_url")]
    public string? TokenUrl { get; init; }

    [JsonPropertyName("scopes")]
    public List<string> Scopes { get; init; } = new();
}
