#!/bin/bash
LOG_FILE="docs/task-log.md"
if [ ! -f "$LOG_FILE" ]; then
  echo "# ✅ AIタスク実行ログ" > "$LOG_FILE"
  echo "| 日時 | タスク内容 | ステータス |" >> "$LOG_FILE"
  echo "|------|------------|------------|" >> "$LOG_FILE"
fi
COUNT=$(grep -c '^|' "$LOG_FILE")

if [ "$COUNT" -gt 50 ]; then
  DATE=$(date +%Y%m%d)
  mkdir -p docs/logs
  mv "$LOG_FILE" "docs/logs/task-log-$DATE.md"
  echo "# ✅ AIタスク実行ログ" > "$LOG_FILE"
  echo "| 日時 | タスク内容 | ステータス |" >> "$LOG_FILE"
  echo "|------|------------|------------|" >> "$LOG_FILE"
fi
