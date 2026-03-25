using Middleware.Api.Auth;
using Middleware.Api.Endpoints;
using Middleware.Api.Engine;
using Middleware.Api.Middleware;

var builder = WebApplication.CreateBuilder(args);

// Connection string: appsettings.json ConnectionStrings:Postgres or DATABASE_URL env var
var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
if (!string.IsNullOrEmpty(databaseUrl))
{
    builder.Configuration["ConnectionStrings:Postgres"] = databaseUrl;
}

// Infrastructure
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient();

// Engine services
builder.Services.AddSingleton<ConfigLoader>();
builder.Services.AddSingleton<InputValidator>();
builder.Services.AddSingleton<ParameterMapper>();
builder.Services.AddTransient<TargetExecutor>();
builder.Services.AddSingleton<ResponseExtractor>();
builder.Services.AddTransient<ExecutionLogger>();

// Auth
builder.Services.AddTransient<AuthResolverFactory>();

// Orchestrator
builder.Services.AddTransient<MiddlewareOrchestrator>();

// CORS — configurable via Cors:AllowedOrigins in appsettings, defaults to allow all
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
        if (origins is { Length: > 0 })
            policy.WithOrigins(origins);
        else
            policy.AllowAnyOrigin();

        policy.AllowAnyMethod().AllowAnyHeader();
    });
});

var app = builder.Build();

// Ensure database schema on startup
using (var scope = app.Services.CreateScope())
{
    var loader = scope.ServiceProvider.GetRequiredService<ConfigLoader>();
    try
    {
        await loader.EnsureTableAsync();
        app.Logger.LogInformation("Database tables verified/created");
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Could not ensure database tables — will retry on first request");
    }
}

app.UseErrorHandling();
app.UseRateLimiting();
app.UseAdminAuth();
app.UseCors();

// Health check
app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    timestamp = DateTimeOffset.UtcNow
}));

// Map endpoints — admin first (specific routes), then catch-all middleware
app.MapAdminEndpoints();
app.MapMiddlewareEndpoints();

app.Run();

// Make Program class accessible for integration tests
public partial class Program { }
