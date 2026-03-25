#!/bin/bash
# safe-build.sh — Build + restart PM2 atomico
# CME deve usare questo invece di "npm run build" diretto
set -e
cd /home/deploy/Claude-playground/controlla-me
echo "[safe-build] Starting build..."
npm run build 2>&1
echo "[safe-build] Build OK. Restarting PM2..."
pm2 restart controlla-me --update-env 2>&1
echo "[safe-build] Done. Server restarted."
