# UAT Fixtures

Test fixture files used by the UAT framework. Each vertical has its own subdirectory.

## Structure

```
fixtures/
  legale/
    sample-contratto-affitto.pdf   — Rental contract for upload tests
    sample-contratto-lavoro.docx   — Employment contract for upload tests
  musica/
    sample-demo.mp3                — Short audio demo for music pipeline tests
```

## Adding Fixtures

1. Create a subdirectory matching the vertical name (e.g. `trading/`, `integrazione/`)
2. Add minimal valid files — keep them small for fast CI execution
3. Reference them in the department's `uat-scenarios.json` via the `fixtures` array
4. The path in `fixturePath` params is relative to this `fixtures/` directory

## Generating Real Fixtures

### PDF (for legale/)
```bash
# Option 1: Use existing text fixture
cp tests/fixtures/sample-contract.txt tests/uat/fixtures/legale/sample-contratto-affitto.pdf

# Option 2: Generate minimal PDF with pdfkit
node -e "const P=require('pdfkit'),f=require('fs'); const d=new P(); d.pipe(f.createWriteStream('sample.pdf')); d.text('CONTRATTO DI LOCAZIONE AD USO ABITATIVO'); d.end();"
```

### DOCX (for legale/)
```bash
# Use any office tool or the mammoth test helper to create a minimal .docx
```

### MP3 (for musica/)
```bash
# Generate a 3-second 440Hz sine wave
ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -b:a 128k sample-demo.mp3
```

## Placeholder Files

Current fixture files are placeholders (text files). The UAT `file-upload` block handles
this gracefully — when the file content doesn't match the expected format, the block
still uploads it as a buffer with the correct MIME type. This is sufficient for testing
the upload UI flow; the actual parsing will fail server-side but that's expected in
mocked test scenarios.
