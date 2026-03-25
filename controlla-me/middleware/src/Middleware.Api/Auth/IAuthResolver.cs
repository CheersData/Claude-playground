using Middleware.Api.Models;

namespace Middleware.Api.Auth;

public interface IAuthResolver
{
    Task<Dictionary<string, string>> ResolveAsync(AuthConfig config);
}
