using System.Text.Json;
using Middleware.Api.Engine;
using Middleware.Api.Models;
using Xunit;

namespace Middleware.Tests;

public class ValidatorTests
{
    private readonly InputValidator _validator = new();

    private static Dictionary<string, JsonElement> ParseInput(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    [Fact]
    public void Required_field_missing_returns_error()
    {
        var config = new InputConfig
        {
            Fields = new Dictionary<string, FieldConfig>
            {
                ["name"] = new FieldConfig { Type = "string", Required = true }
            }
        };

        var errors = _validator.Validate(ParseInput("{}"), config);

        Assert.Single(errors);
        Assert.Equal("name", errors[0].Field);
        Assert.Equal("required", errors[0].Code);
    }

    [Fact]
    public void Valid_input_returns_no_errors()
    {
        var config = new InputConfig
        {
            Fields = new Dictionary<string, FieldConfig>
            {
                ["name"] = new FieldConfig { Type = "string", Required = true },
                ["age"] = new FieldConfig { Type = "number", Required = false }
            }
        };

        var errors = _validator.Validate(ParseInput("""{"name":"Alice","age":30}"""), config);

        Assert.Empty(errors);
    }

    [Fact]
    public void Wrong_type_returns_error()
    {
        var config = new InputConfig
        {
            Fields = new Dictionary<string, FieldConfig>
            {
                ["age"] = new FieldConfig { Type = "number", Required = true }
            }
        };

        var errors = _validator.Validate(ParseInput("""{"age":"not_a_number"}"""), config);

        Assert.Single(errors);
        Assert.Equal("type", errors[0].Code);
    }

    [Fact]
    public void String_min_max_length_validated()
    {
        var config = new InputConfig
        {
            Fields = new Dictionary<string, FieldConfig>
            {
                ["code"] = new FieldConfig { Type = "string", MinLength = 3, MaxLength = 5 }
            }
        };

        var tooShort = _validator.Validate(ParseInput("""{"code":"AB"}"""), config);
        Assert.Single(tooShort);
        Assert.Equal("min_length", tooShort[0].Code);

        var tooLong = _validator.Validate(ParseInput("""{"code":"ABCDEF"}"""), config);
        Assert.Single(tooLong);
        Assert.Equal("max_length", tooLong[0].Code);

        var valid = _validator.Validate(ParseInput("""{"code":"ABCD"}"""), config);
        Assert.Empty(valid);
    }

    [Fact]
    public void Number_min_max_validated()
    {
        var config = new InputConfig
        {
            Fields = new Dictionary<string, FieldConfig>
            {
                ["amount"] = new FieldConfig { Type = "number", Min = 1.0, Max = 100.0 }
            }
        };

        var tooLow = _validator.Validate(ParseInput("""{"amount":0.5}"""), config);
        Assert.Single(tooLow);
        Assert.Equal("min", tooLow[0].Code);

        var tooHigh = _validator.Validate(ParseInput("""{"amount":200}"""), config);
        Assert.Single(tooHigh);
        Assert.Equal("max", tooHigh[0].Code);
    }

    [Fact]
    public void Pattern_validation()
    {
        var config = new InputConfig
        {
            Fields = new Dictionary<string, FieldConfig>
            {
                ["zip"] = new FieldConfig { Type = "string", Pattern = @"^\d{5}$" }
            }
        };

        var invalid = _validator.Validate(ParseInput("""{"zip":"abc"}"""), config);
        Assert.Single(invalid);
        Assert.Equal("pattern", invalid[0].Code);

        var valid = _validator.Validate(ParseInput("""{"zip":"12345"}"""), config);
        Assert.Empty(valid);
    }

    [Fact]
    public void Enum_validation()
    {
        var config = new InputConfig
        {
            Fields = new Dictionary<string, FieldConfig>
            {
                ["status"] = new FieldConfig
                {
                    Type = "string",
                    Enum = new List<string> { "active", "inactive", "pending" }
                }
            }
        };

        var invalid = _validator.Validate(ParseInput("""{"status":"deleted"}"""), config);
        Assert.Single(invalid);
        Assert.Equal("enum", invalid[0].Code);

        var valid = _validator.Validate(ParseInput("""{"status":"active"}"""), config);
        Assert.Empty(valid);
    }

    [Fact]
    public void Format_email_validation()
    {
        var config = new InputConfig
        {
            Fields = new Dictionary<string, FieldConfig>
            {
                ["email"] = new FieldConfig { Type = "string", Format = "email" }
            }
        };

        var invalid = _validator.Validate(ParseInput("""{"email":"not-email"}"""), config);
        Assert.Single(invalid);
        Assert.Equal("format", invalid[0].Code);

        var valid = _validator.Validate(ParseInput("""{"email":"test@example.com"}"""), config);
        Assert.Empty(valid);
    }

    [Fact]
    public void Cross_field_at_least_one()
    {
        var config = new InputConfig
        {
            Fields = new Dictionary<string, FieldConfig>
            {
                ["email"] = new FieldConfig { Type = "string" },
                ["phone"] = new FieldConfig { Type = "string" }
            },
            Validators = new List<CrossFieldValidator>
            {
                new CrossFieldValidator
                {
                    Type = "at_least_one",
                    Fields = new List<string> { "email", "phone" }
                }
            }
        };

        var invalid = _validator.Validate(ParseInput("{}"), config);
        Assert.Single(invalid);
        Assert.Equal("at_least_one", invalid[0].Code);

        var valid = _validator.Validate(ParseInput("""{"email":"a@b.com"}"""), config);
        Assert.Empty(valid);
    }

    [Fact]
    public void Cross_field_mutually_exclusive()
    {
        var config = new InputConfig
        {
            Fields = new Dictionary<string, FieldConfig>
            {
                ["card_token"] = new FieldConfig { Type = "string" },
                ["bank_account"] = new FieldConfig { Type = "string" }
            },
            Validators = new List<CrossFieldValidator>
            {
                new CrossFieldValidator
                {
                    Type = "mutually_exclusive",
                    Fields = new List<string> { "card_token", "bank_account" }
                }
            }
        };

        var invalid = _validator.Validate(
            ParseInput("""{"card_token":"tok_123","bank_account":"ba_456"}"""), config);
        Assert.Single(invalid);
        Assert.Equal("mutually_exclusive", invalid[0].Code);

        var valid = _validator.Validate(ParseInput("""{"card_token":"tok_123"}"""), config);
        Assert.Empty(valid);
    }

    [Fact]
    public void Cross_field_depends_on()
    {
        var config = new InputConfig
        {
            Fields = new Dictionary<string, FieldConfig>
            {
                ["shipping_address"] = new FieldConfig { Type = "string" },
                ["shipping_method"] = new FieldConfig { Type = "string" }
            },
            Validators = new List<CrossFieldValidator>
            {
                new CrossFieldValidator
                {
                    Type = "depends_on",
                    Fields = new List<string> { "shipping_method", "shipping_address" }
                }
            }
        };

        var invalid = _validator.Validate(ParseInput("""{"shipping_method":"express"}"""), config);
        Assert.Single(invalid);
        Assert.Equal("depends_on", invalid[0].Code);

        var valid = _validator.Validate(
            ParseInput("""{"shipping_method":"express","shipping_address":"123 Main St"}"""), config);
        Assert.Empty(valid);
    }
}
