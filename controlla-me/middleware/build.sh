#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOTNET_DIR="$SCRIPT_DIR/dotnet"

# Extract SDK if not already done
if [ ! -f "$DOTNET_DIR/dotnet" ]; then
    echo "📦 Extracting .NET 8 SDK..."
    mkdir -p "$DOTNET_DIR"
    tar -xzf "$SCRIPT_DIR/dotnet-sdk.tar.gz" -C "$DOTNET_DIR"
    echo "✅ .NET SDK extracted"
fi

export DOTNET_ROOT="$DOTNET_DIR"
export PATH="$DOTNET_DIR:$PATH"
export DOTNET_CLI_TELEMETRY_OPTOUT=1

echo "🔧 .NET version: $(dotnet --version)"

cd "$SCRIPT_DIR"

echo ""
echo "📥 Restoring dependencies..."
dotnet restore Middleware.sln

echo ""
echo "🔨 Building..."
dotnet build Middleware.sln --configuration Release --no-restore

echo ""
echo "🧪 Running tests..."
dotnet test Middleware.sln --configuration Release --no-build --verbosity normal

echo ""
echo "✅ Build + test completati con successo!"
echo ""
echo "Per avviare il server:"
echo "  export DOTNET_ROOT=$DOTNET_DIR"
echo "  export PATH=\$DOTNET_ROOT:\$PATH"
echo "  cd $SCRIPT_DIR/src/Middleware.Api"
echo "  dotnet run"
