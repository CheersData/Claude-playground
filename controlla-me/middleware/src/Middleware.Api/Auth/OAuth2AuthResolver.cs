using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Middleware.Api.Models;

namespace Middleware.Api.Auth;

public class OAuth2AuthResolver : IAuthResolver
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly ILogger<OAuth2AuthResolver> _logger;

    private const string CacheKeyPrefix = "oauth2_token_";

    public OAuth2AuthResolver(
        IHttpClientFactory httpClientFactory,
        IMemoryCache cache,
        ILogger<OAuth2AuthResolver> logger)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _logger = logger;
    }

    public async Task<Dictionary<string, string>> ResolveAsync(AuthConfig config)
    {
        var tokenUrl = config.TokenUrl
            ?? throw new InvalidOperationException("OAuth2 requires token_url to be configured.");

        var clientIdEnv = config.ClientIdEnv ?? "OAUTH2_CLIENT_ID";
        var clientSecretEnv = config.ClientSecretEnv ?? "OAUTH2_CLIENT_SECRET";

        var clientId = Environment.GetEnvironmentVariable(clientIdEnv)
            ?? throw new InvalidOperationException($"Environment variable '{clientIdEnv}' not set for OAuth2.");
        var clientSecret = Environment.GetEnvironmentVariable(clientSecretEnv)
            ?? throw new InvalidOperationException($"Environment variable '{clientSecretEnv}' not set for OAuth2.");

        // Build cache key from client ID + scopes
        var scopeKey = string.Join(",", config.Scopes.OrderBy(s => s));
        var cacheKey = CacheKeyPrefix + clientId + "_" + scopeKey;

        if (_cache.TryGetValue(cacheKey, out string? cachedToken) && cachedToken is not null)
        {
            return new Dictionary<string, string>
            {
                ["access_token"] = cachedToken,
                ["token_type"] = "Bearer"
            };
        }

        // Request new token via client_credentials flow
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);

        var formData = new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret
        };

        if (config.Scopes.Count > 0)
            formData["scope"] = string.Join(" ", config.Scopes);

        var request = new HttpRequestMessage(HttpMethod.Post, tokenUrl)
        {
            Content = new FormUrlEncodedContent(formData)
        };

        var response = await client.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("OAuth2 token request failed: {Status} {Body}", response.StatusCode, body);
            throw new InvalidOperationException($"OAuth2 token request failed with status {response.StatusCode}");
        }

        var tokenResponse = JsonSerializer.Deserialize<JsonElement>(body);

        var accessToken = tokenResponse.TryGetProperty("access_token", out var at)
            ? at.GetString()
            : throw new InvalidOperationException("OAuth2 response missing 'access_token'");

        // Cache token with expiry (default 55 minutes if not specified)
        var expiresIn = tokenResponse.TryGetProperty("expires_in", out var ei)
            ? ei.GetInt32()
            : 3300; // 55 minutes default

        // Cache for 90% of the expiry time to allow buffer
        var cacheDuration = TimeSpan.FromSeconds(expiresIn * 0.9);
        _cache.Set(cacheKey, accessToken, cacheDuration);

        _logger.LogInformation("OAuth2 token acquired, cached for {Duration}s", (int)cacheDuration.TotalSeconds);

        return new Dictionary<string, string>
        {
            ["access_token"] = accessToken!,
            ["token_type"] = "Bearer"
        };
    }
}
