#!/bin/bash
set -e
echo "Generating AI review report..."
DATE=$(date +%Y-%m-%d)
mkdir -p docs/reports
REPORT="docs/reports/ai-report-${DATE}.md"
echo "# AI Review Report (${DATE})" > "$REPORT"
if [ -f docs/task-log.md ]; then
  echo "## Recent Tasks" >> "$REPORT"
  echo "" >> "$REPORT"
  grep '^|' docs/task-log.md | tail -n 5 >> "$REPORT"
fi
echo "Report saved to $REPORT"
