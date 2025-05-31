#!/bin/bash
set -eux
# 基本ツール
sudo yum update -y
sudo yum install -y git docker awscli
# AWS関連追加コマンド
# Session Manager Plugin
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux/$(uname -m)/session-manager-plugin.rpm" -o session-manager-plugin.rpm
sudo yum install -y session-manager-plugin.rpm
rm -f session-manager-plugin.rpm
# SSM Agent（Amazon Linux 2/2023は標準搭載だが念のため）
sudo yum install -y amazon-ssm-agent || true
sudo systemctl enable --now amazon-ssm-agent
# ECS CLI
sudo curl -Lo /usr/local/bin/ecs-cli https://amazon-ecs-cli.s3.amazonaws.com/ecs-cli-linux-amd64-latest
sudo chmod +x /usr/local/bin/ecs-cli
# eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin
# AWS CDK
sudo npm install -g aws-cdk
# AWS SAM CLI
sudo yum install -y aws-sam-cli || sudo pip3 install aws-sam-cli

# code-server install
curl -fsSL https://code-server.dev/install.sh | sh
sudo systemctl enable --now code-server@$USER

# git worktree用ディレクトリ
mkdir -p /home/ec2-user/repos
chown ec2-user:ec2-user /home/ec2-user/repos

# 任意: dotfilesや初期セットアップ
# su - ec2-user -c 'git clone ...'

# gh CLI install
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
sudo yum install -y gh

# gh copilot CLI (gh拡張)
sudo -u ec2-user gh extension install github/gh-copilot

# claude CLI (npm経由)
sudo -u ec2-user npm install -g claude-cli || sudo -u ec2-user npm install -g @anthropic-ai/claude-cli

# MCP（Model Context Protocol）を利用したい場合は、各自で必要なMCPサーバー/クライアントの公式手順に従いインストール・設定してください。

# .envからトークンを設定（存在すれば）
if [ -f /home/ec2-user/.env ]; then
  export $(grep -v '^#' /home/ec2-user/.env | xargs)
fi

# gh認証
if [ -n "$GITHUB_TOKEN" ]; then
  sudo -u ec2-user gh auth login --with-token < <(echo "$GITHUB_TOKEN")
fi

# claude CLI用APIキー設定
if [ -n "$CLAUDE_API_KEY" ]; then
  echo "export CLAUDE_API_KEY=$CLAUDE_API_KEY" >> /home/ec2-user/.bashrc
fi

# 追加でインストールする便利ツール
sudo yum install -y zsh tmux htop jq tree unzip make gcc python3 nodejs yarn fzf bat ripgrep neovim

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
