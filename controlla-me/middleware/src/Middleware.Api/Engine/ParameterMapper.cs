using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Middleware.Api.Models;

namespace Middleware.Api.Engine;

public class ParameterMapper
{
    public Dictionary<string, object?> Map(
        Dictionary<string, MappingNode> mappingNodes,
        Dictionary<string, JsonElement> input,
        Dictionary<string, string> authCredentials)
    {
        var result = new Dictionary<string, object?>();

        foreach (var (key, node) in mappingNodes)
        {
            result[key] = ResolveNode(node, input, authCredentials);
        }

        return result;
    }

    public object? ResolveNode(
        MappingNode node,
        Dictionary<string, JsonElement> input,
        Dictionary<string, string> authCredentials)
    {
        // If node has children, resolve recursively
        if (node.Children is not null)
        {
            var childResult = new Dictionary<string, object?>();
            foreach (var (childKey, childNode) in node.Children)
            {
                childResult[childKey] = ResolveNode(childNode, input, authCredentials);
            }
            return childResult;
        }

        object? rawValue = node.Source switch
        {
            "static" => ConvertValue(node.Value),
            "input" => ResolveInput(node.Field, input),
            "env" => node.Env is not null ? Environment.GetEnvironmentVariable(node.Env) : null,
            "auth" => node.AuthField is not null && authCredentials.TryGetValue(node.AuthField, out var av) ? av : null,
            "conditional" => ResolveConditional(node.Conditions, input, node.Default),
            "template" => ResolveTemplate(node.Template, input, authCredentials),
            _ => node.Default
        };

        // Apply default if null
        rawValue ??= ConvertValue(node.Default);

        // Apply transform
        if (node.Transform is not null)
            rawValue = ApplyTransform(rawValue, node.Transform);

        return rawValue;
    }

    private static object? ResolveInput(string? field, Dictionary<string, JsonElement> input)
    {
        if (field is null) return null;

        // Support dotted paths: "address.city"
        var parts = field.Split('.');
        if (!input.TryGetValue(parts[0], out var current))
            return null;

        for (var i = 1; i < parts.Length; i++)
        {
            if (current.ValueKind != JsonValueKind.Object)
                return null;
            if (!current.TryGetProperty(parts[i], out current))
                return null;
        }

        return ConvertJsonElement(current);
    }

    private static object? ResolveConditional(
        List<ConditionNode>? conditions,
        Dictionary<string, JsonElement> input,
        object? defaultValue)
    {
        if (conditions is null) return ConvertValue(defaultValue);

        foreach (var cond in conditions)
        {
            var fieldValue = ResolveInput(cond.Field, input);
            var condValue = ConvertValue(cond.Value);

            var match = cond.Operator switch
            {
                "eq" => Equals(fieldValue?.ToString(), condValue?.ToString()),
                "neq" => !Equals(fieldValue?.ToString(), condValue?.ToString()),
                "gt" => CompareNumeric(fieldValue, condValue) > 0,
                "lt" => CompareNumeric(fieldValue, condValue) < 0,
                "gte" => CompareNumeric(fieldValue, condValue) >= 0,
                "lte" => CompareNumeric(fieldValue, condValue) <= 0,
                "exists" => fieldValue is not null,
                "not_exists" => fieldValue is null,
                _ => false
            };

            if (match) return ConvertValue(cond.Then);
        }

        return ConvertValue(defaultValue);
    }

    private static string? ResolveTemplate(
        string? template,
        Dictionary<string, JsonElement> input,
        Dictionary<string, string> authCredentials)
    {
        if (template is null) return null;

        return Regex.Replace(template, @"\{(\w+(?:\.\w+)*)\}", match =>
        {
            var key = match.Groups[1].Value;

            // Try input first
            var val = ResolveInput(key, input);
            if (val is not null) return val.ToString() ?? "";

            // Try auth
            if (authCredentials.TryGetValue(key, out var authVal))
                return authVal;

            // Try env
            var envVal = Environment.GetEnvironmentVariable(key);
            if (envVal is not null) return envVal;

            return match.Value; // Leave unresolved
        });
    }

    public static object? ApplyTransform(object? value, string transform)
    {
        if (value is null) return null;

        return transform switch
        {
            "uppercase" => value.ToString()?.ToUpperInvariant(),
            "lowercase" => value.ToString()?.ToLowerInvariant(),
            "trim" => value.ToString()?.Trim(),
            "to_string" => value.ToString(),
            "to_number" => double.TryParse(value.ToString(), CultureInfo.InvariantCulture, out var n) ? n : value,
            "to_cents" => double.TryParse(value.ToString(), CultureInfo.InvariantCulture, out var d) ? (long)Math.Round(d * 100) : value,
            "format_date_iso" => DateTimeOffset.TryParse(value.ToString(), out var dt) ? dt.ToString("o") : value,
            _ => value
        };
    }

    private static int CompareNumeric(object? a, object? b)
    {
        if (double.TryParse(a?.ToString(), CultureInfo.InvariantCulture, out var da) &&
            double.TryParse(b?.ToString(), CultureInfo.InvariantCulture, out var db))
            return da.CompareTo(db);
        return string.Compare(a?.ToString(), b?.ToString(), StringComparison.Ordinal);
    }

    internal static object? ConvertJsonElement(JsonElement element)
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
            _ => element.GetRawText()
        };
    }

    internal static object? ConvertValue(object? value)
    {
        if (value is JsonElement je)
            return ConvertJsonElement(je);
        return value;
    }
}
