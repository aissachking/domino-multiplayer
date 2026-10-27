#!/usr/bin/env bash
# Runs a command, streams its output, and on failure turns the tail of the log
# into a GitHub annotation so the reason is visible on the run summary page.
set -o pipefail
title="$1"; shift
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  tail_text="$(grep -vE '^\s*$' "$log" | tail -n 60 | sed 's/%/%25/g' | sed ':a;N;$!ba;s/\n/%0A/g')"
  echo "::error title=${title} failed::${tail_text}"
  {
    echo "### ❌ ${title}"
    echo '```'
    tail -n 120 "$log"
    echo '```'
  } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
fi
exit "$status"
