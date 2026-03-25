#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "=== RESTORE ==="
dotnet restore
echo "=== BUILD ==="
dotnet build --no-restore
echo "=== TEST ==="
dotnet test --no-build --verbosity normal
echo "=== ALL DONE ==="
