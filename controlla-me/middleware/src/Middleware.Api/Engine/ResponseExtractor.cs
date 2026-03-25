using System.Text.Json;
using System.Text.RegularExpressions;

namespace Middleware.Api.Engine;

public class ResponseExtractor
{
    /// <summary>
    /// Extract fields from a JSON response using JSONPath-like expressions.
    /// Supports: $.field, $.nested.field, $.array[0], $.array[0].field
    /// </summary>
    public Dictionary<string, object?> Extract(string? rawJson, Dictionary<string, string> extractionRules)
    {
        var result = new Dictionary<string, object?>();

        if (string.IsNullOrWhiteSpace(rawJson))
        {
            foreach (var key in extractionRules.Keys)
                result[key] = null;
            return result;
        }

        JsonElement root;
        try
        {
            root = JsonSerializer.Deserialize<JsonElement>(rawJson);
        }
        catch
        {
            foreach (var key in extractionRules.Keys)
                result[key] = null;
            return result;
        }

        foreach (var (outputKey, jsonPath) in extractionRules)
        {
            result[outputKey] = ResolvePath(root, jsonPath);
        }

        return result;
    }

    internal static object? ResolvePath(JsonElement root, string path)
    {
        if (string.IsNullOrEmpty(path)) return null;

        // Strip leading $. if present
        var cleanPath = path.StartsWith("$.") ? path[2..] : path.TrimStart('$').TrimStart('.');

        if (string.IsNullOrEmpty(cleanPath))
            return ConvertElement(root);

        var current = root;

        // Tokenize: split by dots but respect array brackets
        var tokens = Tokenize(cleanPath);

        foreach (var token in tokens)
        {
            // Check for array index: field[0] or just [0]
            var arrayMatch = Regex.Match(token, @"^(\w*)\[(\d+)\]$");
            if (arrayMatch.Success)
            {
                var fieldPart = arrayMatch.Groups[1].Value;
                var index = int.Parse(arrayMatch.Groups[2].Value);

                if (!string.IsNullOrEmpty(fieldPart))
                {
                    if (current.ValueKind != JsonValueKind.Object ||
                        !current.TryGetProperty(fieldPart, out current))
                        return null;
                }

                if (current.ValueKind != JsonValueKind.Array || index >= current.GetArrayLength())
                    return null;

                current = current[index];
            }
            else
            {
                if (current.ValueKind != JsonValueKind.Object ||
                    !current.TryGetProperty(token, out current))
                    return null;
            }
        }

        return ConvertElement(current);
    }

    private static List<string> Tokenize(string path)
    {
        var tokens = new List<string>();
        var current = "";

        for (var i = 0; i < path.Length; i++)
        {
            if (path[i] == '.' && !current.Contains('['))
            {
                if (current.Length > 0)
                {
                    tokens.Add(current);
                    current = "";
                }
            }
            else
            {
                current += path[i];
                if (path[i] == ']')
                {
                    tokens.Add(current);
                    current = "";
                    // Skip next dot if present
                    if (i + 1 < path.Length && path[i + 1] == '.') i++;
                }
            }
        }

        if (current.Length > 0) tokens.Add(current);
        return tokens;
    }

    private static object? ConvertElement(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number when element.TryGetInt64(out var l) => l,
            JsonValueKind.Number => element.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            JsonValueKind.Undefined => null,
            // For objects and arrays, return the raw JSON string
            _ => element.GetRawText()
        };
    }
}
