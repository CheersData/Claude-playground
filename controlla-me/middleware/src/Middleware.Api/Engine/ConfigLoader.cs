using System.Text.Json;
using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Middleware.Api.Models;
using Npgsql;

namespace Middleware.Api.Engine;

public class ConfigLoader
{
    private readonly IConfiguration _configuration;
    private readonly IMemoryCache _cache;
    private readonly ILogger<ConfigLoader> _logger;
    private readonly TimeSpan _cacheTtl;

    private const string CacheKeyPrefix = "mw_config_";
    private const string CacheKeyAll = "mw_configs_all";

    public ConfigLoader(IConfiguration configuration, IMemoryCache cache, ILogger<ConfigLoader> logger)
    {
        _configuration = configuration;
        _cache = cache;
        _logger = logger;
        _cacheTtl = TimeSpan.FromSeconds(configuration.GetValue("Middleware:CacheTtlSeconds", 60));
    }

    private string GetConnectionString() =>
        _configuration.GetConnectionString("Postgres")
        ?? throw new InvalidOperationException("Missing ConnectionStrings:Postgres");

    private async Task<NpgsqlConnection> OpenConnectionAsync()
    {
        var conn = new NpgsqlConnection(GetConnectionString());
        await conn.OpenAsync();
        return conn;
    }

    public async Task EnsureTableAsync()
    {
        await using var conn = await OpenConnectionAsync();
        await conn.ExecuteAsync("""
            CREATE TABLE IF NOT EXISTS middleware_configs (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                config JSONB NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS middleware_logs (
                id BIGSERIAL PRIMARY KEY,
                config_slug TEXT NOT NULL,
                request_path TEXT NOT NULL,
                request_method TEXT NOT NULL,
                status_code INT NOT NULL,
                duration_ms BIGINT NOT NULL,
                success BOOLEAN NOT NULL,
                error TEXT,
                request_body JSONB,
                response_body JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS idx_middleware_logs_slug ON middleware_logs(config_slug);
            CREATE INDEX IF NOT EXISTS idx_middleware_logs_created ON middleware_logs(created_at DESC);
        """);
    }

    public async Task<MiddlewareConfig?> GetBySlugAsync(string slug)
    {
        var cacheKey = CacheKeyPrefix + slug;
        if (_cache.TryGetValue(cacheKey, out MiddlewareConfig? cached))
            return cached;

        await using var conn = await OpenConnectionAsync();
        var row = await conn.QueryFirstOrDefaultAsync<ConfigRow>(
            "SELECT config FROM middleware_configs WHERE slug = @Slug AND enabled = true",
            new { Slug = slug });

        if (row?.Config is null) return null;

        var config = JsonSerializer.Deserialize<MiddlewareConfig>(row.Config);
        if (config is not null)
            _cache.Set(cacheKey, config, _cacheTtl);

        return config;
    }

    public async Task<MiddlewareConfig?> GetByPathAsync(string path)
    {
        var configs = await GetAllAsync();
        return configs.FirstOrDefault(c =>
            c.Enabled && path.TrimStart('/').StartsWith(c.Endpoint.Path.TrimStart('/'), StringComparison.OrdinalIgnoreCase));
    }

    public async Task<List<MiddlewareConfig>> GetAllAsync()
    {
        if (_cache.TryGetValue(CacheKeyAll, out List<MiddlewareConfig>? cached))
            return cached!;

        await using var conn = await OpenConnectionAsync();
        var rows = await conn.QueryAsync<ConfigRow>(
            "SELECT config FROM middleware_configs ORDER BY slug");

        var configs = rows
            .Where(r => r.Config is not null)
            .Select(r => JsonSerializer.Deserialize<MiddlewareConfig>(r.Config!))
            .Where(c => c is not null)
            .Cast<MiddlewareConfig>()
            .ToList();

        _cache.Set(CacheKeyAll, configs, _cacheTtl);
        return configs;
    }

    public async Task<MiddlewareConfig> CreateAsync(MiddlewareConfig config)
    {
        var withId = config with { Id = Guid.NewGuid().ToString() };
        var json = JsonSerializer.Serialize(withId);

        await using var conn = await OpenConnectionAsync();
        await conn.ExecuteAsync(
            "INSERT INTO middleware_configs (id, slug, name, config, enabled) VALUES (@Id, @Slug, @Name, @Config::jsonb, @Enabled)",
            new { withId.Id, withId.Slug, withId.Name, Config = json, withId.Enabled });

        InvalidateCache(withId.Slug);
        return withId;
    }

    public async Task<MiddlewareConfig?> UpdateAsync(string slug, MiddlewareConfig config)
    {
        var json = JsonSerializer.Serialize(config);

        await using var conn = await OpenConnectionAsync();
        var affected = await conn.ExecuteAsync(
            "UPDATE middleware_configs SET config = @Config::jsonb, name = @Name, enabled = @Enabled, updated_at = now() WHERE slug = @Slug",
            new { Config = json, config.Name, config.Enabled, Slug = slug });

        InvalidateCache(slug);
        return affected > 0 ? config : null;
    }

    public async Task<bool> DeleteAsync(string slug)
    {
        await using var conn = await OpenConnectionAsync();
        var affected = await conn.ExecuteAsync(
            "DELETE FROM middleware_configs WHERE slug = @Slug",
            new { Slug = slug });

        InvalidateCache(slug);
        return affected > 0;
    }

    private void InvalidateCache(string slug)
    {
        _cache.Remove(CacheKeyPrefix + slug);
        _cache.Remove(CacheKeyAll);
    }

    private record ConfigRow
    {
        public string? Config { get; init; }
    }
}
