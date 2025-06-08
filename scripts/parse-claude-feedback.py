#!/usr/bin/env python3
import os, json
from pathlib import Path

feedback_dir = Path("feedback/claude-tasks")
tasks_dir = Path("tasks")
tasks_dir.mkdir(exist_ok=True)

template_file = feedback_dir / "_template.md"

def parse_feedback_file(file):
    with file.open() as f:
        content = f.read()
    lines = content.splitlines()
    if len(lines) < 6 or lines[0].strip() == "## 🧠 改善提案テンプレート":
        return None
    try:
        task = {
            "file": lines[1].split(':', 1)[1].strip(),
            "range": lines[2].split(':', 1)[1].strip(),
            "type": lines[3].split(':', 1)[1].strip(),
            "importance": lines[4].split(':', 1)[1].strip(),
            "body": lines[5].split(':', 1)[1].strip(),
        }
        return task
    except Exception as e:
        print(f"[WARN] {file}: parse error: {e}")
        return None

for file in feedback_dir.glob("*.md"):
    if file == template_file:
        continue
    task = parse_feedback_file(file)
    if task:
        out_path = tasks_dir / (file.stem + ".json")
        with out_path.open("w") as f:
            json.dump(task, f, indent=2)
    else:
        print(f"[SKIP] {file}")
