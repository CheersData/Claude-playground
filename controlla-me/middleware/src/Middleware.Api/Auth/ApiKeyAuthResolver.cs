using Middleware.Api.Models;

namespace Middleware.Api.Auth;

public class ApiKeyAuthResolver : IAuthResolver
{
    public Task<Dictionary<string, string>> ResolveAsync(AuthConfig config)
    {
        var apiKeyEnv = config.ApiKeyEnv ?? "API_KEY";
        var apiKey = Environment.GetEnvironmentVariable(apiKeyEnv)
            ?? throw new InvalidOperationException($"Environment variable '{apiKeyEnv}' not set for API key auth.");

        return Task.FromResult(new Dictionary<string, string>
        {
            ["api_key"] = apiKey
        });
    }
}
