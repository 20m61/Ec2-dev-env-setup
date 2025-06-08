#!/bin/bash
# セーフインストール: 既存ディレクトリを .bak でバックアップし、ファイル展開を自動化
set -e

for dir in .github docs feedback scripts; do
  if [ -d "$dir" ]; then
    bak_dir="${dir}.bak.$(date +%Y%m%d%H%M%S)"
    mv "$dir" "$bak_dir"
    echo "Backup: $dir -> $bak_dir"
  fi
  mkdir -p "$dir"
done
echo "展開処理はここに追加してください（例: ファイルコピーやテンプレート展開）"
