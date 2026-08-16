#!/usr/bin/env bash
# Pull the latest Contract Management System (CMS) into contracts/.
#
# The CMS lives in its own repo (ananteshwark/cms) and was stitched in with
# `git subtree`. This script pulls upstream changes into the contracts/ prefix,
# so upgrades made in the original codebase land here too. Run it from the repo
# root on a clean working tree; it creates a merge commit you then review & push.
#
#   bash scripts/sync-contracts.sh [branch]
#
# Default branch: claude/contract-management-system-buhdr3
set -euo pipefail

PREFIX="contracts"
REMOTE="cms-upstream"
REMOTE_URL="https://github.com/ananteshwark/cms.git"
BRANCH="${1:-claude/contract-management-system-buhdr3}"

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "!! working tree is not clean — commit or stash first." >&2
  exit 1
fi

# Ensure the upstream remote exists and points at the CMS repo.
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  git remote add "$REMOTE" "$REMOTE_URL"
fi

echo ">> fetching $REMOTE/$BRANCH"
git fetch "$REMOTE" "$BRANCH"

echo ">> pulling upstream changes into $PREFIX/ (squashed)"
git subtree pull --prefix="$PREFIX" "$REMOTE" "$BRANCH" --squash

echo ">> done. Review the merge, rebuild, then push:"
echo "     git log --oneline -3"
echo "     docker compose -f docker-compose.prod.yml -f docker-compose.contracts.yml up -d --build"
