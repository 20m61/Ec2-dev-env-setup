#!/bin/bash
set -eux
# 基本ツール
sudo yum update -y
sudo yum install -y git docker awscli
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user

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
