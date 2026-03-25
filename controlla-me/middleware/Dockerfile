# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution and project files first for layer caching
COPY Middleware.sln .
COPY src/Middleware.Api/Middleware.Api.csproj src/Middleware.Api/
COPY tests/Middleware.Tests/Middleware.Tests.csproj tests/Middleware.Tests/

RUN dotnet restore

# Copy everything and publish
COPY . .
RUN dotnet publish src/Middleware.Api -c Release -o /app/publish

# Stage 2: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app

COPY --from=build /app/publish .

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

ENTRYPOINT ["dotnet", "Middleware.Api.dll"]
