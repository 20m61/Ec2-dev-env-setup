#!/bin/bash
set -e
echo "Generating AI review report..."
DATE=$(date +%Y-%m-%d)
REPORT="docs/reports/ai-report-${DATE}.md"
mkdir -p docs/reports
{
  echo "# AI Review Report (${DATE})"
  echo
  echo "## Task Log Summary"
  awk -F'|' 'NR>4 && NF>=4 { gsub(/^ *| *$/, "", $2); gsub(/^ *| *$/, "", $3); gsub(/^ *| *$/, "", $4); print "- " $2 " " $3 " - " $4 }' docs/task-log.md
} > "$REPORT"
