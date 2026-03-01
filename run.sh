#!/usr/bin/env bash
set -e

# AmbonMUD Load Tester - build dashboard and run
# Usage: ./run.sh [--config path/to/config.yaml]
#        ./run.sh              (uses swarm.example.yaml)

echo "[AmbonMUD] Installing dependencies..."
bun install

cd dashboard
bun install
cd ..

echo "[AmbonMUD] Building dashboard..."
cd dashboard
bun run build
cd ..

echo "[AmbonMUD] Starting load tester..."
exec bun run src/main.ts "$@"
