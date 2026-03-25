using System.Text.Json;
using Middleware.Api.Engine;
using Middleware.Api.Models;

namespace Middleware.Api.Endpoints;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/admin/configs");

        group.MapGet("/", ListConfigs);
        group.MapPost("/", CreateConfig);
        group.MapGet("/{slug}", GetConfig);
        group.MapPut("/{slug}", ReplaceConfig);
        group.MapPatch("/{slug}", UpdateConfig);
        group.MapDelete("/{slug}", DeleteConfig);
        group.MapPost("/{slug}/test", TestConfig);
        group.MapGet("/{slug}/logs", GetLogs);

        // Health check at /admin/health
        app.MapGet("/admin/health", HealthCheck);
    }

    private static async Task<IResult> ListConfigs(ConfigLoader loader)
    {
        var configs = await loader.GetAllAsync();
        return Results.Ok(configs.Select(c => new
        {
            c.Id,
            c.Slug,
            c.Name,
            c.Version,
            c.Enabled,
            endpoint_path = c.Endpoint.Path,
            endpoint_method = c.Endpoint.Method,
            auth_type = c.Auth.Type,
            target_url = c.Target.BaseUrl + c.Target.Path
        }));
    }

    private static async Task<IResult> CreateConfig(HttpContext ctx, ConfigLoader loader)
    {
        MiddlewareConfig? config;
        try
        {
            config = await ctx.Request.ReadFromJsonAsync<MiddlewareConfig>();
        }
        catch (JsonException ex)
        {
            return Results.BadRequest(new { error = "Invalid JSON", detail = ex.Message });
        }

        if (config is null)
            return Results.BadRequest(new { error = "Empty body" });

        if (string.IsNullOrWhiteSpace(config.Slug))
            return Results.BadRequest(new { error = "Slug is required" });

        // Check slug doesn't exist
        var existing = await loader.GetBySlugAsync(config.Slug);
        if (existing is not null)
            return Results.Conflict(new { error = $"Config with slug '{config.Slug}' already exists" });

        var created = await loader.CreateAsync(config);
        return Results.Created($"/admin/configs/{created.Slug}", created);
    }

    private static async Task<IResult> GetConfig(string slug, ConfigLoader loader)
    {
        var config = await loader.GetBySlugAsync(slug);
        return config is null
            ? Results.NotFound(new { error = $"Config '{slug}' not found" })
            : Results.Ok(config);
    }

    private static async Task<IResult> UpdateConfig(string slug, HttpContext ctx, ConfigLoader loader)
    {
        var existing = await loader.GetBySlugAsync(slug);
        if (existing is null)
            return Results.NotFound(new { error = $"Config '{slug}' not found" });

        MiddlewareConfig? update;
        try
        {
            update = await ctx.Request.ReadFromJsonAsync<MiddlewareConfig>();
        }
        catch (JsonException ex)
        {
            return Results.BadRequest(new { error = "Invalid JSON", detail = ex.Message });
        }

        if (update is null)
            return Results.BadRequest(new { error = "Empty body" });

        // Merge: keep existing slug/id
        var merged = update with { Id = existing.Id, Slug = existing.Slug };
        var updated = await loader.UpdateAsync(slug, merged);

        return updated is null
            ? Results.StatusCode(500)
            : Results.Ok(updated);
    }

    private static async Task<IResult> DeleteConfig(string slug, ConfigLoader loader)
    {
        var deleted = await loader.DeleteAsync(slug);
        return deleted
            ? Results.Ok(new { deleted = true, slug })
            : Results.NotFound(new { error = $"Config '{slug}' not found" });
    }

    private static async Task<IResult> TestConfig(
        string slug,
        HttpContext ctx,
        ConfigLoader loader,
        MiddlewareOrchestrator orchestrator)
    {
        var config = await loader.GetBySlugAsync(slug);
        if (config is null)
            return Results.NotFound(new { error = $"Config '{slug}' not found" });

        var input = new Dictionary<string, JsonElement>();
        if (ctx.Request.HasJsonContentType())
        {
            try
            {
                var body = await ctx.Request.ReadFromJsonAsync<Dictionary<string, JsonElement>>();
                if (body is not null) input = body;
            }
            catch (JsonException)
            {
                return Results.BadRequest(new { error = "Invalid JSON body" });
            }
        }

        var result = await orchestrator.ExecuteAsync(
            config, input, $"/admin/configs/{slug}/test", "POST", dryRun: true);

        return Results.Json(result.Data, statusCode: result.StatusCode);
    }

    private static async Task<IResult> ReplaceConfig(string slug, HttpContext ctx, ConfigLoader loader)
    {
        MiddlewareConfig? config;
        try
        {
            config = await ctx.Request.ReadFromJsonAsync<MiddlewareConfig>();
        }
        catch (JsonException ex)
        {
            return Results.BadRequest(new { error = "Invalid JSON", detail = ex.Message });
        }

        if (config is null)
            return Results.BadRequest(new { error = "Empty body" });

        var existing = await loader.GetBySlugAsync(slug);
        if (existing is null)
            return Results.NotFound(new { error = $"Config '{slug}' not found" });

        var replaced = config with { Id = existing.Id, Slug = slug };
        var updated = await loader.UpdateAsync(slug, replaced);

        return updated is null
            ? Results.StatusCode(500)
            : Results.Ok(updated);
    }

    private static async Task<IResult> GetLogs(
        string slug,
        ExecutionLogger logger,
        int limit = 50,
        int offset = 0)
    {
        var logs = await logger.GetLogsAsync(slug, Math.Min(limit, 200), offset);
        return Results.Ok(logs);
    }

    private static async Task<IResult> HealthCheck(ConfigLoader loader)
    {
        try
        {
            var configs = await loader.GetAllAsync();
            return Results.Ok(new
            {
                status = "healthy",
                configCount = configs.Count,
                timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            return Results.Json(
                new { status = "unhealthy", error = ex.Message, timestamp = DateTime.UtcNow },
                statusCode: 503);
        }
    }
}
