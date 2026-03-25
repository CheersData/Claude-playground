using System.Text.Json;
using Middleware.Api.Auth;
using Middleware.Api.Models;

namespace Middleware.Api.Engine;

public class MiddlewareOrchestrator
{
    private readonly InputValidator _validator;
    private readonly ParameterMapper _mapper;
    private readonly TargetExecutor _executor;
    private readonly ResponseExtractor _extractor;
    private readonly ExecutionLogger _executionLogger;
    private readonly AuthResolverFactory _authFactory;
    private readonly ILogger<MiddlewareOrchestrator> _logger;

    public MiddlewareOrchestrator(
        InputValidator validator,
        ParameterMapper mapper,
        TargetExecutor executor,
        ResponseExtractor extractor,
        ExecutionLogger executionLogger,
        AuthResolverFactory authFactory,
        ILogger<MiddlewareOrchestrator> logger)
    {
        _validator = validator;
        _mapper = mapper;
        _executor = executor;
        _extractor = extractor;
        _executionLogger = executionLogger;
        _authFactory = authFactory;
        _logger = logger;
    }

    public async Task<OrchestratorResult> ExecuteAsync(
        MiddlewareConfig config,
        Dictionary<string, JsonElement> input,
        string requestPath,
        string requestMethod,
        bool dryRun = false)
    {
        // 1. Validate input
        var validationErrors = _validator.Validate(input, config.Input);
        if (validationErrors.Count > 0)
        {
            return new OrchestratorResult
            {
                Success = false,
                StatusCode = 400,
                Data = new Dictionary<string, object?>
                {
                    ["error"] = "Validation failed",
                    ["validation_errors"] = validationErrors
                }
            };
        }

        // 2. Resolve auth credentials
        Dictionary<string, string> authCredentials;
        try
        {
            var authResolver = _authFactory.Create(config.Auth);
            authCredentials = await authResolver.ResolveAsync(config.Auth);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Auth resolution failed for {Slug}", config.Slug);
            return new OrchestratorResult
            {
                Success = false,
                StatusCode = 502,
                Data = new Dictionary<string, object?>
                {
                    ["error"] = "Authentication with target service failed"
                }
            };
        }

        // 3. Map parameters
        var mappedHeaders = _mapper.Map(config.Mapping.Headers, input, authCredentials);
        var mappedQuery = _mapper.Map(config.Mapping.Query, input, authCredentials);
        var mappedBody = _mapper.Map(config.Mapping.Body, input, authCredentials);

        // Add auth headers automatically if not already mapped
        if (config.Auth.Type == "bearer" && authCredentials.TryGetValue("access_token", out var token))
        {
            mappedHeaders.TryAdd("Authorization", $"Bearer {token}");
        }
        else if (config.Auth.Type == "api-key" && authCredentials.TryGetValue("api_key", out var apiKey))
        {
            var headerName = config.Auth.ApiKeyHeader ?? "X-API-Key";
            mappedHeaders.TryAdd(headerName, apiKey);
        }
        else if (config.Auth.Type == "basic" && authCredentials.TryGetValue("basic_token", out var basicToken))
        {
            mappedHeaders.TryAdd("Authorization", $"Basic {basicToken}");
        }
        else if (config.Auth.Type == "oauth2" && authCredentials.TryGetValue("access_token", out var oauthToken))
        {
            mappedHeaders.TryAdd("Authorization", $"Bearer {oauthToken}");
        }

        // Build resolved URL
        var resolvedUrl = config.Target.BaseUrl.TrimEnd('/') + "/" + config.Target.Path.TrimStart('/');

        // Dry-run: return mapped data without executing
        if (dryRun)
        {
            return new OrchestratorResult
            {
                Success = true,
                StatusCode = 200,
                Data = new Dictionary<string, object?>
                {
                    ["dry_run"] = true,
                    ["resolved_url"] = resolvedUrl,
                    ["mapped_headers"] = SanitizeHeaders(mappedHeaders),
                    ["mapped_query"] = mappedQuery,
                    ["mapped_body"] = mappedBody,
                    ["auth_type"] = config.Auth.Type
                }
            };
        }

        // 4. Execute target request
        var executionResult = await _executor.ExecuteAsync(
            config.Target, resolvedUrl, mappedHeaders, mappedQuery, mappedBody);

        // 5. Extract response fields
        var extracted = _extractor.Extract(executionResult.RawResponse, config.Response.Extract);

        // Add static fields
        foreach (var (key, value) in config.Response.StaticFields)
        {
            extracted.TryAdd(key, value);
        }

        // 6. Log (fire-and-forget)
        _executionLogger.Log(
            config.Slug,
            requestPath,
            requestMethod,
            executionResult.StatusCode,
            executionResult.DurationMs,
            executionResult.Success,
            executionResult.Error,
            mappedBody,
            executionResult.RawResponse);

        // 7. Build response
        if (!executionResult.Success)
        {
            var errorData = new Dictionary<string, object?>
            {
                ["error"] = config.Response.OnError.DefaultMessage,
                ["status"] = executionResult.StatusCode
            };

            if (config.Response.OnError.IncludeTargetError)
                errorData["target_error"] = executionResult.Error;

            return new OrchestratorResult
            {
                Success = false,
                StatusCode = config.Response.ForwardStatus ? executionResult.StatusCode : 502,
                Data = errorData,
                DurationMs = executionResult.DurationMs,
                RetryCount = executionResult.RetryCount
            };
        }

        return new OrchestratorResult
        {
            Success = true,
            StatusCode = config.Response.ForwardStatus ? executionResult.StatusCode : 200,
            Data = extracted,
            DurationMs = executionResult.DurationMs,
            RetryCount = executionResult.RetryCount
        };
    }

    private static Dictionary<string, object?> SanitizeHeaders(Dictionary<string, object?> headers)
    {
        var sanitized = new Dictionary<string, object?>();
        foreach (var (key, value) in headers)
        {
            if (key.Equals("Authorization", StringComparison.OrdinalIgnoreCase))
                sanitized[key] = "***REDACTED***";
            else
                sanitized[key] = value;
        }
        return sanitized;
    }
}

public record OrchestratorResult
{
    public bool Success { get; init; }
    public int StatusCode { get; init; }
    public Dictionary<string, object?> Data { get; init; } = new();
    public long DurationMs { get; init; }
    public int RetryCount { get; init; }
}
