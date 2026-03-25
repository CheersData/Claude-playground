using Microsoft.Extensions.Caching.Memory;
using Middleware.Api.Models;

namespace Middleware.Api.Auth;

public class AuthResolverFactory
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly ILogger<OAuth2AuthResolver> _oauthLogger;

    public AuthResolverFactory(
        IHttpClientFactory httpClientFactory,
        IMemoryCache cache,
        ILogger<OAuth2AuthResolver> oauthLogger)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _oauthLogger = oauthLogger;
    }

    public IAuthResolver Create(AuthConfig config)
    {
        return config.Type.ToLowerInvariant() switch
        {
            "none" => new NoneAuthResolver(),
            "bearer" => new BearerAuthResolver(),
            "api-key" or "apikey" or "api_key" => new ApiKeyAuthResolver(),
            "basic" => new BasicAuthResolver(),
            "oauth2" => new OAuth2AuthResolver(_httpClientFactory, _cache, _oauthLogger),
            _ => throw new InvalidOperationException($"Unknown auth type: {config.Type}")
        };
    }
}

internal class NoneAuthResolver : IAuthResolver
{
    public Task<Dictionary<string, string>> ResolveAsync(AuthConfig config)
        => Task.FromResult(new Dictionary<string, string>());
}
