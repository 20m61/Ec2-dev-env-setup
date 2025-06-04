#!/bin/zsh
# tools/ssm_check.sh
# SSM経由でEC2セットアップ状況を一括検証（Tailscale/docker/code-server/cloud-initログ等）
# 必要: AWS CLI, jq, EC2インスタンスID, リージョン

set -euo pipefail

# 引数でINSTANCE_ID, REGIONを受け取る（なければ設定ファイルから）
INSTANCE_ID="${1:-}"
REGION="${2:-}"

if [[ -z "$INSTANCE_ID" || -z "$REGION" ]]; then
  CONFIG_FILE="$(dirname $0)/ec2_ssh_config"
  if [[ -f $CONFIG_FILE ]]; then
    source $CONFIG_FILE
  else
    echo "INSTANCE_ID, REGIONが引数または$CONFIG_FILEで指定されていません。" >&2
    echo "使い方: $0 <INSTANCE_ID> <REGION>" >&2
    exit 1
  fi
fi

: "INSTANCE_ID, REGION 必須チェック" && [[ -z "${INSTANCE_ID:-}" || -z "${REGION:-}" ]] && {
  echo "INSTANCE_ID, REGIONが未設定です。" >&2
  exit 1
}

function ssm_run() {
  local desc="$1"; shift
  echo "\n===== $desc ====="
  aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters "commands=$1" \
    --region "$REGION" \
    --output json > /tmp/ssm_cmd.json
  local cmd_id=$(jq -r '.Command.CommandId' /tmp/ssm_cmd.json)
  sleep 2
  aws ssm list-command-invocations \
    --command-id "$cmd_id" \
    --details \
    --region "$REGION" \
    --output json | jq -r '.CommandInvocations[0].CommandPlugins[0].Output'
}

ssm_run "Tailscale/docker/code-serverバージョン" '["tailscale version | cat; docker --version | cat; code-server --version | cat"]'
ssm_run "cloud-init-output.log" '["cat /var/log/cloud-init-output.log"]'
ssm_run "env_setup_script.log" '["cat /var/log/env_setup_script.log"]'

# 必要に応じて追加の検証コマンドをここに追記

echo "\n全チェック完了。"
