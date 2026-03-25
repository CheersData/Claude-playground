using Middleware.Api.Models;

namespace Middleware.Api.Auth;

public class BearerAuthResolver : IAuthResolver
{
    public Task<Dictionary<string, string>> ResolveAsync(AuthConfig config)
    {
        var tokenEnv = config.TokenEnv ?? "BEARER_TOKEN";
        var token = Environment.GetEnvironmentVariable(tokenEnv)
            ?? throw new InvalidOperationException($"Environment variable '{tokenEnv}' not set for bearer auth.");

        return Task.FromResult(new Dictionary<string, string>
        {
            ["access_token"] = token
        });
    }
}
