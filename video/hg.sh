#!/usr/bin/env bash
# Runs the HeyGen CLI installed in WSL. File args: use /mnt/c/... paths.
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- /home/alejandra_yol/.local/bin/heygen "$@"
