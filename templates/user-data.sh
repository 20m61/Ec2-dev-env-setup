#!/bin/bash
set -eux

# .envファイルの自動読込（存在すれば）
if [ -f /home/ec2-user/.env ]; then
  set -a
  source /home/ec2-user/.env
  set +a
fi

# セキュリティアップデートは定期的に実施してください（Amazon Linuxは自動アップデート設定も推奨）
sudo yum update -y
# 基本ツール
sudo yum install -y git docker awscli
# AWS CLI v2 install（明示的にv2をインストール）
if ! command -v aws &>/dev/null || [[ $(aws --version 2>&1) != aws-cli/2* ]]; then
  curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
  unzip -o awscliv2.zip
  sudo ./aws/install --update
  rm -rf awscliv2.zip aws/
fi

# Session Manager Plugin
if ! command -v session-manager-plugin &>/dev/null; then
  curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux/$(uname -m)/session-manager-plugin.rpm" -o session-manager-plugin.rpm
  sudo yum install -y session-manager-plugin.rpm
  rm -f session-manager-plugin.rpm
fi

# SSM Agent（Amazon Linux 2/2023は標準搭載だが念のため）
sudo yum install -y amazon-ssm-agent || true
sudo systemctl enable --now amazon-ssm-agent

# AWS Copilot CLI（ECS CLIは非推奨のため置換）
if ! command -v copilot &>/dev/null; then
  curl -Lo copilot https://github.com/aws/copilot-cli/releases/latest/download/copilot-linux
  chmod +x copilot
  sudo mv copilot /usr/local/bin/copilot
fi

# eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" -o /tmp/eksctl.tar.gz
mkdir -p /tmp/eksctl-unpack
 tar xz -C /tmp/eksctl-unpack -f /tmp/eksctl.tar.gz
sudo mv /tmp/eksctl-unpack/eksctl /usr/local/bin/eksctl
rm -rf /tmp/eksctl.tar.gz /tmp/eksctl-unpack

# AWS CDK（バージョン固定例: v2系最新安定版。必要に応じてバージョンを調整）
if ! command -v cdk &>/dev/null; then
  sudo npm install -g aws-cdk@2
fi

# AWS SAM CLI
sudo yum install -y aws-sam-cli || sudo pip3 install aws-sam-cli

# dockerグループにec2-userを追加し、sudo無しでdocker利用可
sudo usermod -aG docker ec2-user

# --- Tailscale install & 起動 ---
if ! command -v tailscale &>/dev/null; then
  curl -fsSL https://pkgs.tailscale.com/stable/install.sh | sh
fi
sudo systemctl enable --now tailscaled
# 認証キーがあれば自動ログイン
if [ -n "$TAILSCALE_AUTHKEY" ]; then
  sudo tailscale up --authkey $TAILSCALE_AUTHKEY --ssh
else
  echo "Tailscaleの認証は手動で行ってください: sudo tailscale up --ssh"
fi

# code-server install
curl -fsSL https://code-server.dev/install.sh | sh
# code-serverのパスワードをランダム生成しファイルに保存（セキュリティ強化）
CODE_SERVER_PASS=$(openssl rand -base64 32)
echo "code-server password: $CODE_SERVER_PASS" > /home/ec2-user/code-server-password.txt
chown ec2-user:ec2-user /home/ec2-user/code-server-password.txt
chmod 600 /home/ec2-user/code-server-password.txt
# systemd起動時にパスワードを環境変数で渡す
sudo bash -c 'echo "export PASSWORD=\"$CODE_SERVER_PASS\"" > /etc/profile.d/code-server.sh'
# code-serverをec2-userで起動
sudo systemctl enable --now code-server@ec2-user

# git worktree用ディレクトリ
mkdir -p /home/ec2-user/repos
chown ec2-user:ec2-user /home/ec2-user/repos

# --- dotfilesや初期セットアップ（AI自律化例）---
# 例: dotfilesリポジトリをクローンし、セットアップスクリプトを実行
if [ -n "$DOTFILES_REPO" ]; then
  su - ec2-user -c "git clone --depth=1 $DOTFILES_REPO /home/ec2-user/dotfiles && bash /home/ec2-user/dotfiles/setup.sh || true"
fi

# 例: 任意の開発リポジトリをクローンし、worktree展開（GIT_REPO_URL, GIT_WORKTREES 変数を.envで指定）
if [ -n "$GIT_REPO_URL" ]; then
  su - ec2-user -c "git clone $GIT_REPO_URL /home/ec2-user/repos/main"
  if [ -n "$GIT_WORKTREES" ]; then
    IFS=',' read -ra WT <<< \"$GIT_WORKTREES\"
    for branch in \"${WT[@]}\"; do
      su - ec2-user -c \"cd /home/ec2-user/repos/main && git fetch origin $branch && git worktree add ../$branch origin/$branch\"
    done
  fi
fi

# --- gh CLI認証の完全自動化（GITHUB_TOKENがあれば）---
if [ -n "$GITHUB_TOKEN" ]; then
  su - ec2-user -c "echo $GITHUB_TOKEN | gh auth login --with-token || true"
fi

# gh CLI install
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
sudo yum install -y gh

# gh copilot CLI (gh拡張)
sudo -u ec2-user gh extension install github/gh-copilot

# Maxplan CLI (Claude Code)は自動インストール対象外です。必要な場合は各自で公式手順に従いインストール・認証設定を行ってください。
# 例: sudo -u ec2-user npm install -g maxplan-cli
# .envのMAXPLAN_API_KEYも自動設定しません。必要に応じて手動で設定してください。
# if [ -n "$MAXPLAN_API_KEY" ]; then
#   echo "export MAXPLAN_API_KEY=$MAXPLAN_API_KEY" >> /home/ec2-user/.bashrc
# fi

# 追加でインストールする便利ツール（外部ファイルから読み込み）
if [ -f /home/ec2-user/tools.txt ]; then
  TOOL_LIST="/home/ec2-user/tools.txt"
else
  TOOL_LIST="/tmp/tools.txt"
fi
if [ ! -f "$TOOL_LIST" ]; then
  cp /opt/tools.txt "$TOOL_LIST" 2>/dev/null || cp $(dirname "$0")/tools.txt "$TOOL_LIST" 2>/dev/null || true
fi
if [ -f "$TOOL_LIST" ]; then
  xargs -a "$TOOL_LIST" sudo yum install -y
else
  # fallback: デフォルトリスト
  sudo yum install -y zsh tmux htop jq tree unzip make gcc python3 nodejs yarn fzf bat ripgrep neovim
fi

# docker compose (v2) install
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose --version

# Node.js バージョン管理（n, nvm どちらか選択。ここでは n を例示）
sudo npm install -g n
sudo n lts
# パスの再設定（必要に応じて）
export PATH="/usr/local/bin:$PATH"

# yarn（公式推奨のcorepack経由でインストール）
corepack enable
yarn --version
