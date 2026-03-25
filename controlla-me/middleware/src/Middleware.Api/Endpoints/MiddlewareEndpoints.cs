using System.Text.Json;
using Middleware.Api.Engine;

namespace Middleware.Api.Endpoints;

public static class MiddlewareEndpoints
{
    public static void MapMiddlewareEndpoints(this WebApplication app)
    {
        // Catch-all: resolves config from path and delegates to orchestrator
        app.Map("/{**path}", HandleRequest);
    }

    private static async Task<IResult> HandleRequest(
        HttpContext ctx,
        ConfigLoader configLoader,
        MiddlewareOrchestrator orchestrator)
    {
        var path = ctx.Request.Path.Value ?? "/";
        var method = ctx.Request.Method;

        // Skip admin paths (handled by AdminEndpoints)
        if (path.StartsWith("/admin", StringComparison.OrdinalIgnoreCase))
            return Results.NotFound();

        // Find matching config
        var config = await configLoader.GetByPathAsync(path);
        if (config is null)
            return Results.NotFound(new { error = "No middleware config found for this path." });

        if (!config.Enabled)
            return Results.StatusCode(503);

        // Check method match
        if (!config.Endpoint.Method.Equals(method, StringComparison.OrdinalIgnoreCase) &&
            config.Endpoint.Method != "*")
        {
            return Results.StatusCode(405);
        }

        // Parse input body
        var input = new Dictionary<string, JsonElement>();
        if (ctx.Request.HasJsonContentType())
        {
            try
            {
                var body = await JsonSerializer.DeserializeAsync<Dictionary<string, JsonElement>>(ctx.Request.Body);
                if (body is not null) input = body;
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { error = "Invalid JSON body." });
            }
        }

        // Also merge query parameters as input
        foreach (var (key, value) in ctx.Request.Query)
        {
            if (!input.ContainsKey(key))
            {
                var jsonValue = JsonSerializer.Deserialize<JsonElement>($"\"{value.FirstOrDefault() ?? ""}\"");
                input[key] = jsonValue;
            }
        }

        // Execute pipeline
        var result = await orchestrator.ExecuteAsync(config, input, path, method);

        return Results.Json(result.Data, statusCode: result.StatusCode);
    }
}
