#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! /usr/bin/python3 ios/scripts/relay.py flow; then
  echo "The UI flow needs attention. Review the results page and test logs."
  read -r -p "Press Return to close. "
  exit 1
fi
