using System.Text.Json;
using System.Text.RegularExpressions;
using Middleware.Api.Models;

namespace Middleware.Api.Engine;

public class InputValidator
{
    public List<ValidationError> Validate(Dictionary<string, JsonElement> input, InputConfig config)
    {
        var errors = new List<ValidationError>();

        // Per-field validation
        foreach (var (fieldName, fieldConfig) in config.Fields)
        {
            input.TryGetValue(fieldName, out var value);
            var hasValue = value.ValueKind != JsonValueKind.Undefined && value.ValueKind != JsonValueKind.Null;

            // Required check
            if (fieldConfig.Required && !hasValue)
            {
                errors.Add(new ValidationError
                {
                    Field = fieldName,
                    Message = $"Field '{fieldName}' is required.",
                    Code = "required"
                });
                continue;
            }

            if (!hasValue) continue;

            // Type check
            var typeError = ValidateType(fieldName, value, fieldConfig);
            if (typeError is not null)
            {
                errors.Add(typeError);
                continue;
            }

            // String validations
            if (fieldConfig.Type == "string" && value.ValueKind == JsonValueKind.String)
            {
                var str = value.GetString() ?? "";

                if (fieldConfig.MinLength.HasValue && str.Length < fieldConfig.MinLength.Value)
                    errors.Add(new ValidationError { Field = fieldName, Message = $"Must be at least {fieldConfig.MinLength} characters.", Code = "min_length" });

                if (fieldConfig.MaxLength.HasValue && str.Length > fieldConfig.MaxLength.Value)
                    errors.Add(new ValidationError { Field = fieldName, Message = $"Must be at most {fieldConfig.MaxLength} characters.", Code = "max_length" });

                if (fieldConfig.Pattern is not null && !Regex.IsMatch(str, fieldConfig.Pattern))
                    errors.Add(new ValidationError { Field = fieldName, Message = $"Does not match pattern '{fieldConfig.Pattern}'.", Code = "pattern" });

                if (fieldConfig.Enum is not null && !fieldConfig.Enum.Contains(str))
                    errors.Add(new ValidationError { Field = fieldName, Message = $"Must be one of: {string.Join(", ", fieldConfig.Enum)}.", Code = "enum" });

                if (fieldConfig.Format is not null)
                {
                    var formatError = ValidateFormat(fieldName, str, fieldConfig.Format);
                    if (formatError is not null) errors.Add(formatError);
                }
            }

            // Number validations
            if (fieldConfig.Type == "number" && value.TryGetDouble(out var num))
            {
                if (fieldConfig.Min.HasValue && num < fieldConfig.Min.Value)
                    errors.Add(new ValidationError { Field = fieldName, Message = $"Must be >= {fieldConfig.Min}.", Code = "min" });

                if (fieldConfig.Max.HasValue && num > fieldConfig.Max.Value)
                    errors.Add(new ValidationError { Field = fieldName, Message = $"Must be <= {fieldConfig.Max}.", Code = "max" });
            }

            // Integer validations
            if (fieldConfig.Type == "integer" && value.TryGetInt64(out var intNum))
            {
                if (fieldConfig.Min.HasValue && intNum < (long)fieldConfig.Min.Value)
                    errors.Add(new ValidationError { Field = fieldName, Message = $"Must be >= {fieldConfig.Min}.", Code = "min" });

                if (fieldConfig.Max.HasValue && intNum > (long)fieldConfig.Max.Value)
                    errors.Add(new ValidationError { Field = fieldName, Message = $"Must be <= {fieldConfig.Max}.", Code = "max" });
            }
        }

        // Cross-field validators
        foreach (var validator in config.Validators)
        {
            var crossError = ValidateCrossField(validator, input);
            if (crossError is not null) errors.Add(crossError);
        }

        return errors;
    }

    private static ValidationError? ValidateType(string fieldName, JsonElement value, FieldConfig config)
    {
        var valid = config.Type switch
        {
            "string" => value.ValueKind == JsonValueKind.String,
            "number" => value.ValueKind == JsonValueKind.Number,
            "integer" => value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out _),
            "boolean" => value.ValueKind == JsonValueKind.True || value.ValueKind == JsonValueKind.False,
            "array" => value.ValueKind == JsonValueKind.Array,
            "object" => value.ValueKind == JsonValueKind.Object,
            _ => true
        };

        return valid ? null : new ValidationError
        {
            Field = fieldName,
            Message = $"Expected type '{config.Type}', got '{value.ValueKind}'.",
            Code = "type"
        };
    }

    private static ValidationError? ValidateFormat(string fieldName, string value, string format)
    {
        var valid = format switch
        {
            "email" => Regex.IsMatch(value, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"),
            "url" => Uri.TryCreate(value, UriKind.Absolute, out var uri) && (uri.Scheme == "http" || uri.Scheme == "https"),
            "date" => DateOnly.TryParse(value, out _),
            "date-time" => DateTimeOffset.TryParse(value, out _),
            "uuid" => Guid.TryParse(value, out _),
            "ipv4" => System.Net.IPAddress.TryParse(value, out var ip) && ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork,
            _ => true
        };

        return valid ? null : new ValidationError
        {
            Field = fieldName,
            Message = $"Invalid format, expected '{format}'.",
            Code = "format"
        };
    }

    private static ValidationError? ValidateCrossField(CrossFieldValidator validator, Dictionary<string, JsonElement> input)
    {
        switch (validator.Type)
        {
            case "at_least_one":
            {
                var hasAny = validator.Fields.Any(f =>
                    input.TryGetValue(f, out var v) &&
                    v.ValueKind != JsonValueKind.Undefined &&
                    v.ValueKind != JsonValueKind.Null);

                return hasAny ? null : new ValidationError
                {
                    Field = string.Join(", ", validator.Fields),
                    Message = validator.Message ?? $"At least one of [{string.Join(", ", validator.Fields)}] is required.",
                    Code = "at_least_one"
                };
            }
            case "mutually_exclusive":
            {
                var present = validator.Fields.Where(f =>
                    input.TryGetValue(f, out var v) &&
                    v.ValueKind != JsonValueKind.Undefined &&
                    v.ValueKind != JsonValueKind.Null).ToList();

                return present.Count <= 1 ? null : new ValidationError
                {
                    Field = string.Join(", ", present),
                    Message = validator.Message ?? $"Fields [{string.Join(", ", validator.Fields)}] are mutually exclusive.",
                    Code = "mutually_exclusive"
                };
            }
            case "depends_on":
            {
                if (validator.Fields.Count < 2) return null;
                var dependent = validator.Fields[0];
                var dependency = validator.Fields[1];

                var hasDep = input.TryGetValue(dependent, out var depVal) &&
                             depVal.ValueKind != JsonValueKind.Undefined &&
                             depVal.ValueKind != JsonValueKind.Null;
                var hasDependency = input.TryGetValue(dependency, out var dVal) &&
                                    dVal.ValueKind != JsonValueKind.Undefined &&
                                    dVal.ValueKind != JsonValueKind.Null;

                return !hasDep || hasDependency ? null : new ValidationError
                {
                    Field = dependent,
                    Message = validator.Message ?? $"Field '{dependent}' requires '{dependency}' to be present.",
                    Code = "depends_on"
                };
            }
            default:
                return null;
        }
    }
}
