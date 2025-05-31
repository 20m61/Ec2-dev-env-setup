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
