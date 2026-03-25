using System.Text.Json;
using Dapper;
using Npgsql;

namespace Middleware.Api.Engine;

public class ExecutionLogger
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<ExecutionLogger> _logger;

    public ExecutionLogger(IConfiguration configuration, ILogger<ExecutionLogger> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    private string GetConnectionString() =>
        _configuration.GetConnectionString("Postgres")
        ?? throw new InvalidOperationException("Missing ConnectionStrings:Postgres");

    /// <summary>
    /// Fire-and-forget log to database. Does not throw.
    /// </summary>
    public void Log(
        string configSlug,
        string requestPath,
        string requestMethod,
        int statusCode,
        long durationMs,
        bool success,
        string? error,
        object? requestBody,
        object? responseBody)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                await using var conn = new NpgsqlConnection(GetConnectionString());
                await conn.OpenAsync();
                await conn.ExecuteAsync("""
                    INSERT INTO middleware_logs
                        (config_slug, request_path, request_method, status_code, duration_ms, success, error, request_body, response_body)
                    VALUES
                        (@ConfigSlug, @RequestPath, @RequestMethod, @StatusCode, @DurationMs, @Success, @Error, @RequestBody::jsonb, @ResponseBody::jsonb)
                """, new
                {
                    ConfigSlug = configSlug,
                    RequestPath = requestPath,
                    RequestMethod = requestMethod,
                    StatusCode = statusCode,
                    DurationMs = durationMs,
                    Success = success,
                    Error = error,
                    RequestBody = SerializeSafe(requestBody),
                    ResponseBody = SerializeSafe(responseBody)
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to log execution for {Slug}", configSlug);
            }
        });
    }

    public async Task<List<LogEntry>> GetLogsAsync(string slug, int limit = 50, int offset = 0)
    {
        await using var conn = new NpgsqlConnection(GetConnectionString());
        await conn.OpenAsync();
        var rows = await conn.QueryAsync<LogEntry>("""
            SELECT id, config_slug as ConfigSlug, request_path as RequestPath, request_method as RequestMethod,
                   status_code as StatusCode, duration_ms as DurationMs, success, error,
                   request_body as RequestBody, response_body as ResponseBody, created_at as CreatedAt
            FROM middleware_logs
            WHERE config_slug = @Slug
            ORDER BY created_at DESC
            LIMIT @Limit OFFSET @Offset
        """, new { Slug = slug, Limit = limit, Offset = offset });
        return rows.ToList();
    }

    private static string? SerializeSafe(object? value)
    {
        if (value is null) return null;
        try
        {
            return value is string s ? s : JsonSerializer.Serialize(value);
        }
        catch
        {
            return null;
        }
    }
}

public record LogEntry
{
    public long Id { get; init; }
    public string ConfigSlug { get; init; } = "";
    public string RequestPath { get; init; } = "";
    public string RequestMethod { get; init; } = "";
    public int StatusCode { get; init; }
    public long DurationMs { get; init; }
    public bool Success { get; init; }
    public string? Error { get; init; }
    public string? RequestBody { get; init; }
    public string? ResponseBody { get; init; }
    public DateTime CreatedAt { get; init; }
}
