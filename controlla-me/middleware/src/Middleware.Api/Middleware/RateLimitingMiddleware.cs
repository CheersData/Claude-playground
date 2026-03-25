using System.Collections.Concurrent;
using System.Text.Json;
using Middleware.Api.Engine;

namespace Middleware.Api.Middleware;

public class RateLimitingMiddleware : IDisposable
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RateLimitingMiddleware> _logger;
    private readonly Timer _cleanupTimer;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    // Key: "clientIp|configSlug", Value: sorted list of request timestamps
    private static readonly ConcurrentDictionary<string, SlidingWindow> _windows = new();

    private static readonly TimeSpan CleanupInterval = TimeSpan.FromMinutes(5);

    public RateLimitingMiddleware(RequestDelegate next, ILogger<RateLimitingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
        _cleanupTimer = new Timer(CleanupExpiredEntries, null, CleanupInterval, CleanupInterval);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "/";

        // Skip admin and health paths
        if (path.StartsWith("/admin", StringComparison.OrdinalIgnoreCase) ||
            path.Equals("/health", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        var configLoader = context.RequestServices.GetRequiredService<ConfigLoader>();
        var config = await configLoader.GetByPathAsync(path);

        // No config matched or no rate limit configured — pass through
        if (config?.Endpoint.RateLimit is null)
        {
            await _next(context);
            return;
        }

        var rateLimit = config.Endpoint.RateLimit;
        var clientIp = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var key = $"{clientIp}|{config.Slug}";
        var now = DateTimeOffset.UtcNow;
        var window = TimeSpan.FromMinutes(1);

        var slidingWindow = _windows.GetOrAdd(key, _ => new SlidingWindow());

        var (allowed, retryAfterSeconds) = slidingWindow.TryAcquire(now, window, rateLimit.RequestsPerMinute, rateLimit.Burst);

        if (!allowed)
        {
            _logger.LogWarning(
                "Rate limit exceeded for {ClientIp} on {Slug} ({RequestsPerMinute}/min, burst {Burst})",
                clientIp, config.Slug, rateLimit.RequestsPerMinute, rateLimit.Burst);

            context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            context.Response.ContentType = "application/json";
            context.Response.Headers.RetryAfter = retryAfterSeconds.ToString();

            var body = new
            {
                error = "Rate limit exceeded",
                retryAfterSeconds
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(body, JsonOptions));
            return;
        }

        await _next(context);
    }

    private void CleanupExpiredEntries(object? state)
    {
        var cutoff = DateTimeOffset.UtcNow.AddMinutes(-2);
        var keysToRemove = new List<string>();

        foreach (var (key, slidingWindow) in _windows)
        {
            if (slidingWindow.IsExpired(cutoff))
                keysToRemove.Add(key);
        }

        foreach (var key in keysToRemove)
            _windows.TryRemove(key, out _);

        if (keysToRemove.Count > 0)
            _logger.LogDebug("Rate limiter cleanup: removed {Count} expired entries", keysToRemove.Count);
    }

    public void Dispose()
    {
        _cleanupTimer.Dispose();
    }

    /// <summary>
    /// Thread-safe sliding window counter. Tracks request timestamps within a rolling window
    /// and enforces both sustained rate (requests_per_minute) and burst limits.
    /// </summary>
    private sealed class SlidingWindow
    {
        private readonly object _lock = new();
        private readonly List<DateTimeOffset> _timestamps = new();

        /// <summary>
        /// Attempts to record a new request. Returns (true, 0) if allowed,
        /// or (false, retryAfterSeconds) if the rate limit is exceeded.
        /// </summary>
        public (bool Allowed, int RetryAfterSeconds) TryAcquire(
            DateTimeOffset now, TimeSpan window, int maxRequests, int burst)
        {
            lock (_lock)
            {
                // Evict timestamps outside the sliding window
                var windowStart = now - window;
                _timestamps.RemoveAll(t => t < windowStart);

                // Check sustained rate limit (requests per window)
                if (_timestamps.Count >= maxRequests)
                {
                    // Earliest timestamp that would need to expire before we can accept a new request
                    var oldest = _timestamps[0];
                    var retryAfter = (int)Math.Ceiling((oldest + window - now).TotalSeconds);
                    return (false, Math.Max(retryAfter, 1));
                }

                // Check burst: count requests in the last 1-second micro-window
                var burstWindowStart = now.AddSeconds(-1);
                var recentCount = 0;
                for (var i = _timestamps.Count - 1; i >= 0; i--)
                {
                    if (_timestamps[i] >= burstWindowStart)
                        recentCount++;
                    else
                        break; // timestamps are in order, no need to check further
                }

                if (recentCount >= burst)
                {
                    return (false, 1);
                }

                _timestamps.Add(now);
                return (true, 0);
            }
        }

        /// <summary>
        /// Returns true if the window has no timestamps newer than the cutoff,
        /// meaning this entry is stale and can be removed.
        /// </summary>
        public bool IsExpired(DateTimeOffset cutoff)
        {
            lock (_lock)
            {
                return _timestamps.Count == 0 ||
                       _timestamps[^1] < cutoff;
            }
        }
    }
}

public static class RateLimitingMiddlewareExtensions
{
    public static IApplicationBuilder UseRateLimiting(this IApplicationBuilder app)
    {
        return app.UseMiddleware<RateLimitingMiddleware>();
    }
}
