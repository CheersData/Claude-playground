using Middleware.Api.Engine;
using Xunit;

namespace Middleware.Tests;

public class ExtractorTests
{
    private readonly ResponseExtractor _extractor = new();

    [Fact]
    public void Simple_field_extraction()
    {
        var json = """{"id":"123","name":"Test"}""";
        var rules = new Dictionary<string, string>
        {
            ["result_id"] = "$.id",
            ["result_name"] = "$.name"
        };

        var result = _extractor.Extract(json, rules);

        Assert.Equal("123", result["result_id"]);
        Assert.Equal("Test", result["result_name"]);
    }

    [Fact]
    public void Nested_field_extraction()
    {
        var json = """{"data":{"user":{"email":"a@b.com"}}}""";
        var rules = new Dictionary<string, string>
        {
            ["email"] = "$.data.user.email"
        };

        var result = _extractor.Extract(json, rules);

        Assert.Equal("a@b.com", result["email"]);
    }

    [Fact]
    public void Array_index_extraction()
    {
        var json = """{"items":[{"name":"first"},{"name":"second"}]}""";
        var rules = new Dictionary<string, string>
        {
            ["first_item"] = "$.items[0].name",
            ["second_item"] = "$.items[1].name"
        };

        var result = _extractor.Extract(json, rules);

        Assert.Equal("first", result["first_item"]);
        Assert.Equal("second", result["second_item"]);
    }

    [Fact]
    public void Missing_field_returns_null()
    {
        var json = """{"data":{"id":1}}""";
        var rules = new Dictionary<string, string>
        {
            ["missing"] = "$.data.nonexistent"
        };

        var result = _extractor.Extract(json, rules);

        Assert.Null(result["missing"]);
    }

    [Fact]
    public void Null_json_returns_nulls()
    {
        var rules = new Dictionary<string, string>
        {
            ["a"] = "$.x",
            ["b"] = "$.y"
        };

        var result = _extractor.Extract(null, rules);

        Assert.Null(result["a"]);
        Assert.Null(result["b"]);
    }

    [Fact]
    public void Number_extraction_preserves_type()
    {
        var json = """{"count":42,"price":9.99,"flag":true}""";
        var rules = new Dictionary<string, string>
        {
            ["count"] = "$.count",
            ["price"] = "$.price",
            ["flag"] = "$.flag"
        };

        var result = _extractor.Extract(json, rules);

        Assert.Equal(42L, result["count"]);
        Assert.Equal(9.99, result["price"]);
        Assert.Equal(true, result["flag"]);
    }

    [Fact]
    public void Root_extraction()
    {
        var json = """{"id":"root_val"}""";
        var rules = new Dictionary<string, string>
        {
            ["val"] = "$.id"
        };

        var result = _extractor.Extract(json, rules);

        Assert.Equal("root_val", result["val"]);
    }

    [Fact]
    public void Array_out_of_bounds_returns_null()
    {
        var json = """{"items":[1,2,3]}""";
        var rules = new Dictionary<string, string>
        {
            ["oob"] = "$.items[99]"
        };

        var result = _extractor.Extract(json, rules);

        Assert.Null(result["oob"]);
    }

    [Fact]
    public void Invalid_json_returns_nulls()
    {
        var rules = new Dictionary<string, string>
        {
            ["x"] = "$.a"
        };

        var result = _extractor.Extract("not json at all", rules);

        Assert.Null(result["x"]);
    }
}
