namespace Middleware.Api.Models;

public record ValidationError
{
    public string Field { get; init; } = "";
    public string Message { get; init; } = "";
    public string Code { get; init; } = "invalid";
}
