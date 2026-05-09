#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing dependencies"
npm install

echo "==> Running typecheck"
npm run typecheck

echo
echo "Hando bootstrap complete."
echo "Useful commands:"
echo "  npm run cli -- --help"
echo "  npm run cli -- setup"
echo "  npm test"
