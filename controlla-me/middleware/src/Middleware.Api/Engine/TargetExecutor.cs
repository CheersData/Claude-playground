using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Middleware.Api.Models;

namespace Middleware.Api.Engine;

public class TargetExecutor
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<TargetExecutor> _logger;

    public TargetExecutor(IHttpClientFactory httpClientFactory, ILogger<TargetExecutor> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<ExecutionResult> ExecuteAsync(
        TargetConfig target,
        string resolvedUrl,
        Dictionary<string, object?> headers,
        Dictionary<string, object?> queryParams,
        Dictionary<string, object?> body)
    {
        var sw = Stopwatch.StartNew();
        var retryCount = 0;
        var maxRetries = target.Retry.MaxRetries;
        var backoffMs = target.Retry.BackoffMs;
        var retryOnStatus = target.Retry.RetryOnStatus;

        while (true)
        {
            try
            {
                var result = await ExecuteSingleAsync(target, resolvedUrl, headers, queryParams, body);
                sw.Stop();

                if (retryOnStatus.Contains(result.StatusCode) && retryCount < maxRetries)
                {
                    retryCount++;
                    _logger.LogWarning("Retrying request to {Url} (attempt {Attempt}/{Max}, status {Status})",
                        resolvedUrl, retryCount, maxRetries, result.StatusCode);

                    var delay = (int)(backoffMs * Math.Pow(target.Retry.BackoffMultiplier, retryCount - 1));
                    await Task.Delay(delay);
                    continue;
                }

                return result with { DurationMs = sw.ElapsedMilliseconds, RetryCount = retryCount };
            }
            catch (TaskCanceledException) when (retryCount < maxRetries)
            {
                retryCount++;
                _logger.LogWarning("Request timeout to {Url} (attempt {Attempt}/{Max})", resolvedUrl, retryCount, maxRetries);
                var delay = (int)(backoffMs * Math.Pow(target.Retry.BackoffMultiplier, retryCount - 1));
                await Task.Delay(delay);
            }
            catch (Exception ex)
            {
                sw.Stop();
                return new ExecutionResult
                {
                    Success = false,
                    StatusCode = 0,
                    Error = ex.Message,
                    DurationMs = sw.ElapsedMilliseconds,
                    RetryCount = retryCount
                };
            }
        }
    }

    private async Task<ExecutionResult> ExecuteSingleAsync(
        TargetConfig target,
        string resolvedUrl,
        Dictionary<string, object?> headers,
        Dictionary<string, object?> queryParams,
        Dictionary<string, object?> body)
    {
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMilliseconds(target.TimeoutMs);

        // Build URL with query params
        var url = resolvedUrl;
        if (queryParams.Count > 0)
        {
            var queryString = string.Join("&",
                queryParams
                    .Where(kv => kv.Value is not null)
                    .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value?.ToString() ?? "")}"));
            url += (url.Contains('?') ? "&" : "?") + queryString;
        }

        var request = new HttpRequestMessage(new HttpMethod(target.Method.ToUpperInvariant()), url);

        // Set headers
        foreach (var (key, value) in headers)
        {
            if (value is null) continue;
            var strValue = value.ToString() ?? "";

            if (key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)) continue;
            if (key.Equals("Authorization", StringComparison.OrdinalIgnoreCase))
            {
                request.Headers.TryAddWithoutValidation("Authorization", strValue);
                continue;
            }
            request.Headers.TryAddWithoutValidation(key, strValue);
        }

        // Set static target headers
        foreach (var (key, value) in target.Headers)
        {
            if (!request.Headers.Contains(key))
                request.Headers.TryAddWithoutValidation(key, value);
        }

        // Set body
        if (target.Method.ToUpperInvariant() is "POST" or "PUT" or "PATCH")
        {
            var json = JsonSerializer.Serialize(body);
            request.Content = new StringContent(json, Encoding.UTF8, target.ContentType);
        }

        var response = await client.SendAsync(request);
        var responseBody = await response.Content.ReadAsStringAsync();

        return new ExecutionResult
        {
            Success = response.IsSuccessStatusCode,
            StatusCode = (int)response.StatusCode,
            RawResponse = responseBody,
            Error = response.IsSuccessStatusCode ? null : responseBody
        };
    }
}
