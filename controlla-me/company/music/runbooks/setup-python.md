# Runbook: Setup Python Environment per Ufficio Musica

## Prerequisiti

- Python 3.11+
- pip o uv
- ~2GB disco per PyTorch + Demucs (CPU-only: ~800MB)

## Installazione

```bash
# 1. Crea virtual environment
cd music
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows

# 2. Installa dipendenze (CPU-only, niente CUDA)
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -e .

# 3. Verifica installazione
python -c "import demucs; print('Demucs OK')"
python -c "import librosa; print('librosa OK')"
python -c "import essentia; print('Essentia OK')"
python -c "import crepe; print('CREPE OK')"
python -c "import basic_pitch; print('Basic Pitch OK')"
```

## Primo Run

```bash
# Demucs scarica il modello al primo utilizzo (~300MB)
python -m src.agents.stem_separator --input test.mp3
# Attendi download modello htdemucs...
```

## Variabili d'Ambiente

```env
# Aggiungi a .env.local del progetto
TUNEBAT_API_KEY=...          # Opzionale, per trend data
HOOKTHEORY_API_KEY=...       # Opzionale, per progressioni statistiche
```

## Note

- **Essentia**: su alcune distro Linux richiede `apt install libfftw3-dev libsamplerate0-dev`
- **madmom**: richiede Cython. Se fallisce: `pip install Cython && pip install madmom`
- **GPU**: per abilitare CUDA, installare torch con `--index-url https://download.pytorch.org/whl/cu121`
- **Spazio disco**: Demucs modello htdemucs ~300MB, htdemucs_ft ~1.2GB
