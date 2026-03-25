using System.Text.Json;
using Middleware.Api.Engine;
using Middleware.Api.Models;
using Xunit;

namespace Middleware.Tests;

public class MapperTests
{
    private readonly ParameterMapper _mapper = new();

    private static Dictionary<string, JsonElement> ParseInput(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    private static readonly Dictionary<string, string> EmptyAuth = new();

    [Fact]
    public void Static_value_mapped()
    {
        var mapping = new Dictionary<string, MappingNode>
        {
            ["currency"] = new MappingNode { Source = "static", Value = JsonSerializer.Deserialize<JsonElement>("\"usd\"") }
        };

        var result = _mapper.Map(mapping, new Dictionary<string, JsonElement>(), EmptyAuth);

        Assert.Equal("usd", result["currency"]);
    }

    [Fact]
    public void Input_value_mapped()
    {
        var mapping = new Dictionary<string, MappingNode>
        {
            ["customer_name"] = new MappingNode { Source = "input", Field = "name" }
        };

        var input = ParseInput("""{"name":"Alice"}""");
        var result = _mapper.Map(mapping, input, EmptyAuth);

        Assert.Equal("Alice", result["customer_name"]);
    }

    [Fact]
    public void Nested_input_value_mapped()
    {
        var mapping = new Dictionary<string, MappingNode>
        {
            ["city"] = new MappingNode { Source = "input", Field = "address.city" }
        };

        var input = ParseInput("""{"address":{"city":"Rome"}}""");
        var result = _mapper.Map(mapping, input, EmptyAuth);

        Assert.Equal("Rome", result["city"]);
    }

    [Fact]
    public void Auth_value_mapped()
    {
        var mapping = new Dictionary<string, MappingNode>
        {
            ["token"] = new MappingNode { Source = "auth", AuthField = "access_token" }
        };

        var auth = new Dictionary<string, string> { ["access_token"] = "sk-123" };
        var result = _mapper.Map(mapping, new Dictionary<string, JsonElement>(), auth);

        Assert.Equal("sk-123", result["token"]);
    }

    [Fact]
    public void Env_value_mapped()
    {
        Environment.SetEnvironmentVariable("TEST_MW_KEY", "env_value_123");
        try
        {
            var mapping = new Dictionary<string, MappingNode>
            {
                ["key"] = new MappingNode { Source = "env", Env = "TEST_MW_KEY" }
            };

            var result = _mapper.Map(mapping, new Dictionary<string, JsonElement>(), EmptyAuth);

            Assert.Equal("env_value_123", result["key"]);
        }
        finally
        {
            Environment.SetEnvironmentVariable("TEST_MW_KEY", null);
        }
    }

    [Fact]
    public void Conditional_mapping_eq()
    {
        var mapping = new Dictionary<string, MappingNode>
        {
            ["provider"] = new MappingNode
            {
                Source = "conditional",
                Conditions = new List<ConditionNode>
                {
                    new ConditionNode
                    {
                        Field = "country",
                        Operator = "eq",
                        Value = JsonSerializer.Deserialize<JsonElement>("\"IT\""),
                        Then = JsonSerializer.Deserialize<JsonElement>("\"stripe_eu\"")
                    },
                    new ConditionNode
                    {
                        Field = "country",
                        Operator = "eq",
                        Value = JsonSerializer.Deserialize<JsonElement>("\"US\""),
                        Then = JsonSerializer.Deserialize<JsonElement>("\"stripe_us\"")
                    }
                },
                Default = JsonSerializer.Deserialize<JsonElement>("\"stripe_default\"")
            }
        };

        var it = _mapper.Map(mapping, ParseInput("""{"country":"IT"}"""), EmptyAuth);
        Assert.Equal("stripe_eu", it["provider"]);

        var us = _mapper.Map(mapping, ParseInput("""{"country":"US"}"""), EmptyAuth);
        Assert.Equal("stripe_us", us["provider"]);

        var other = _mapper.Map(mapping, ParseInput("""{"country":"JP"}"""), EmptyAuth);
        Assert.Equal("stripe_default", other["provider"]);
    }

    [Fact]
    public void Transform_to_cents()
    {
        var result = ParameterMapper.ApplyTransform(19.99, "to_cents");
        Assert.Equal(1999L, result);
    }

    [Fact]
    public void Transform_uppercase()
    {
        var result = ParameterMapper.ApplyTransform("hello", "uppercase");
        Assert.Equal("HELLO", result);
    }

    [Fact]
    public void Transform_lowercase()
    {
        var result = ParameterMapper.ApplyTransform("HELLO", "lowercase");
        Assert.Equal("hello", result);
    }

    [Fact]
    public void Transform_trim()
    {
        var result = ParameterMapper.ApplyTransform("  spaces  ", "trim");
        Assert.Equal("spaces", result);
    }

    [Fact]
    public void Transform_to_number()
    {
        var result = ParameterMapper.ApplyTransform("42.5", "to_number");
        Assert.Equal(42.5, result);
    }

    [Fact]
    public void Template_interpolation()
    {
        var mapping = new Dictionary<string, MappingNode>
        {
            ["greeting"] = new MappingNode { Source = "template", Template = "Hello, {name}! You are {age} years old." }
        };

        var input = ParseInput("""{"name":"Bob","age":25}""");
        var result = _mapper.Map(mapping, input, EmptyAuth);

        Assert.Equal("Hello, Bob! You are 25 years old.", result["greeting"]);
    }

    [Fact]
    public void Default_value_used_when_input_missing()
    {
        var mapping = new Dictionary<string, MappingNode>
        {
            ["lang"] = new MappingNode
            {
                Source = "input",
                Field = "language",
                Default = JsonSerializer.Deserialize<JsonElement>("\"en\"")
            }
        };

        var result = _mapper.Map(mapping, ParseInput("{}"), EmptyAuth);

        Assert.Equal("en", result["lang"]);
    }

    [Fact]
    public void Nested_children_mapped_recursively()
    {
        var mapping = new Dictionary<string, MappingNode>
        {
            ["metadata"] = new MappingNode
            {
                Source = "static",
                Children = new Dictionary<string, MappingNode>
                {
                    ["source"] = new MappingNode { Source = "static", Value = JsonSerializer.Deserialize<JsonElement>("\"middleware\"") },
                    ["user"] = new MappingNode { Source = "input", Field = "user_id" }
                }
            }
        };

        var input = ParseInput("""{"user_id":"u_123"}""");
        var result = _mapper.Map(mapping, input, EmptyAuth);

        var metadata = result["metadata"] as Dictionary<string, object?>;
        Assert.NotNull(metadata);
        Assert.Equal("middleware", metadata!["source"]);
        Assert.Equal("u_123", metadata["user"]);
    }
}
