@echo off
setlocal

:: AmbonMUD Load Tester - build dashboard and run
:: Usage: run.bat [--config path/to/config.yaml]
::        run.bat              (uses swarm.example.yaml)

echo [AmbonMUD] Installing dependencies...
call bun install
if errorlevel 1 ( echo [AmbonMUD] bun install failed & exit /b 1 )

cd dashboard
call bun install
if errorlevel 1 ( echo [AmbonMUD] dashboard bun install failed & exit /b 1 )

echo [AmbonMUD] Building dashboard...
call bun run build
if errorlevel 1 ( echo [AmbonMUD] Dashboard build failed & exit /b 1 )
cd ..

echo [AmbonMUD] Starting load tester...
call bun run src/main.ts %*
