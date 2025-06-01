#!/bin/zsh
# EC2インスタンスを起動し、SSH接続するスクリプト
# 必要: AWS CLI, jq, SSH キーペア

echo "[DEBUG] PATH=$PATH"
echo "[DEBUG] which aws: $(which aws)"
ls -l $(which aws)

# 設定ファイルのパス
CONFIG_FILE="$(dirname $0)/ec2_ssh_config"

# 設定ファイルがなければ自動生成
if [[ ! -f $CONFIG_FILE ]]; then
  echo "設定ファイル $CONFIG_FILE が見つかりません。自動生成します。"
  cat <<EOF > $CONFIG_FILE
# EC2 SSH スクリプト用設定ファイルサンプル
# 必要な値をデプロイ時に自動生成・書き換えしてください
INSTANCE_ID="i-xxxxxxxxxxxxxxxxx"
KEY_PATH="../keys/my-key.pem"
USER="ec2-user"
REGION="ap-northeast-1"
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_DEFAULT_REGION="ap-northeast-1"
EOF
  echo "設定ファイルを編集してから再度実行してください。"
  exit 1
fi
# 設定ファイルを読み込む
source $CONFIG_FILE

# awsコマンドの存在確認
if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLIが見つかりません。インストールを試みます。"
  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS
    if command -v brew >/dev/null 2>&1; then
      brew install awscli
    else
      echo "Homebrewが必要です。https://brew.sh/ を参照してください。"
      exit 1
    fi
  elif [[ -f /etc/debian_version ]]; then
    sudo apt-get update && sudo apt-get install -y awscli
  elif [[ -f /etc/redhat-release ]]; then
    sudo yum install -y awscli
  else
    echo "対応していないOSです。aws CLIを手動でインストールしてください。"
    exit 1
  fi
fi

# awsコマンドラッパー関数
function aws_safe() {
  aws "$@"
  local aws_status=$?
  if [[ $aws_status -eq 127 ]]; then
    echo "aws CLIが見つかりません。インストールを試みます。"
    exit 1
  fi
  return $aws_status
}

# AWS認証情報のセットアップ
if [[ -n "$AWS_ACCESS_KEY_ID" && -n "$AWS_SECRET_ACCESS_KEY" ]]; then
  export AWS_ACCESS_KEY_ID
  export AWS_SECRET_ACCESS_KEY
  export AWS_DEFAULT_REGION
else
  echo "AWS認証情報が設定ファイルにありません。aws configureを実行します。"
  aws configure
  exit 1
fi

# インスタンスを起動
aws_safe ec2 start-instances --instance-ids $INSTANCE_ID --region $REGION

# runningになるまで待機
# テスト高速化用: TEST_MODE=1 の場合はsleepを短縮
function fast_sleep() {
  if [[ "$TEST_MODE" == "1" ]]; then
    sleep 0.01
  else
    sleep "$1"
  fi
}

while true; do
  STATE=$(aws_safe ec2 describe-instances --instance-ids $INSTANCE_ID --region $REGION \
    --query 'Reservations[0].Instances[0].State.Name' --output text)
  if [[ "$STATE" == "running" ]]; then
    break
  fi
  echo "インスタンス起動待機中...($STATE)"
  fast_sleep 5
done

# パブリックIP取得
IP=$(aws_safe ec2 describe-instances --instance-ids $INSTANCE_ID --region $REGION \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

if [[ "$IP" == "None" ]]; then
  echo "パブリックIPが取得できません。Elastic IP割当やセキュリティグループも確認してください。"
  exit 1
fi

echo "SSH接続: $USER@$IP"
chmod 600 $KEY_PATH
ssh -i $KEY_PATH $USER@$IP
