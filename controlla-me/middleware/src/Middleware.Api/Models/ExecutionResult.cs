namespace Middleware.Api.Models;

public record ExecutionResult
{
    public bool Success { get; init; }
    public int StatusCode { get; init; }
    public Dictionary<string, object?> Data { get; init; } = new();
    public string? Error { get; init; }
    public long DurationMs { get; init; }
    public int RetryCount { get; init; }
    public string? RawResponse { get; init; }
}
