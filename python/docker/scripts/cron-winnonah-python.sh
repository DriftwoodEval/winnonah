#!/usr/bin/env bash
echo
echo "-------------------------------------------------------------"
echo " Running Winnonah Python: $(date)"
echo "-------------------------------------------------------------"

cd /app && uv run main.py
