using System.Text;
using Middleware.Api.Models;

namespace Middleware.Api.Auth;

public class BasicAuthResolver : IAuthResolver
{
    public Task<Dictionary<string, string>> ResolveAsync(AuthConfig config)
    {
        var usernameEnv = config.UsernameEnv ?? "BASIC_USERNAME";
        var passwordEnv = config.PasswordEnv ?? "BASIC_PASSWORD";

        var username = Environment.GetEnvironmentVariable(usernameEnv)
            ?? throw new InvalidOperationException($"Environment variable '{usernameEnv}' not set for basic auth.");
        var password = Environment.GetEnvironmentVariable(passwordEnv)
            ?? throw new InvalidOperationException($"Environment variable '{passwordEnv}' not set for basic auth.");

        var encoded = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{username}:{password}"));

        return Task.FromResult(new Dictionary<string, string>
        {
            ["username"] = username,
            ["password"] = password,
            ["basic_token"] = encoded
        });
    }
}
