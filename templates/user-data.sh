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
