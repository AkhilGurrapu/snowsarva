#!/bin/bash
set -e
if [[ "${DEV_MODE:-}" == "1" ]]; then
  export API_PORT=${API_PORT:-8081}
  python3 app.py
else
  python3 app.py
fi
