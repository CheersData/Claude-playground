namespace Middleware.Api.Middleware;

public class AdminAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string? _expectedKey;
    private static bool _warnedNoKey;

    public AdminAuthMiddleware(RequestDelegate next)
    {
        _next = next;
        _expectedKey = Environment.GetEnvironmentVariable("ADMIN_API_KEY");
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";

        // Only protect /admin paths, excluding /admin/health
        if (path.StartsWith("/admin", StringComparison.OrdinalIgnoreCase)
            && !path.Equals("/admin/health", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrEmpty(_expectedKey))
            {
                if (!_warnedNoKey)
                {
                    var logger = context.RequestServices.GetRequiredService<ILogger<AdminAuthMiddleware>>();
                    logger.LogWarning("ADMIN_API_KEY not set — admin endpoints are unprotected (development mode)");
                    _warnedNoKey = true;
                }
            }
            else
            {
                var clientKey = context.Request.Headers["X-Admin-Key"].FirstOrDefault();
                if (clientKey != _expectedKey)
                {
                    context.Response.StatusCode = 401;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsync("""{"error":"Invalid or missing admin API key"}""");
                    return;
                }
            }
        }

        await _next(context);
    }
}

public static class AdminAuthExtensions
{
    public static IApplicationBuilder UseAdminAuth(this IApplicationBuilder app)
        => app.UseMiddleware<AdminAuthMiddleware>();
}
