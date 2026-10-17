#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! /usr/bin/python3 ios/scripts/relay.py run; then
  echo "Relay could not launch. Run python3 ios/scripts/relay.py setup from this folder."
  read -r -p "Press Return to close. "
  exit 1
fi
