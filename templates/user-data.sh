set -euo pipefail

# --- S3から.envダウンロード（失敗時は詳細ログ出力して即終了） ---
if [ -z "${S3_BUCKET_NAME:-}" ]; then
  echo "S3_BUCKET_NAME環境変数が設定されていません。" >&2
  exit 1
fi
{
  echo "[env-setup] S3から.env取得: $(date)"
  aws s3 cp s3://${S3_BUCKET_NAME}/devenvstack-dev/.env /home/ec2-user/.env --region ap-northeast-1
  ls -l /home/ec2-user/.env
} >> /var/log/env_setup_script.log 2>&1 || {
  echo "[env-setup] .envダウンロード失敗: $(date)" >> /var/log/env_setup_script.log
  exit 1
}

# .envファイルの存在チェック（なければ即エラー終了）
if [ ! -f /home/ec2-user/.env ]; then
  echo ".envファイルが存在しません。デプロイを中断します。" >&2
  exit 1
fi

# .envファイルの自動読込（存在すれば）
chmod 600 /home/ec2-user/.env
set -a
# .envの内容を安全にsource（危険な内容が含まれていないか最低限チェック）
if grep -q -E '^[A-Za-z_][A-Za-z0-9_]*=' /home/ec2-user/.env; then
  source /home/ec2-user/.env
else
  echo ".envファイルの内容が不正です。" >&2
  exit 1
fi
set +a

# セキュリティアップデートは定期的に実施してください（Amazon Linuxは自動アップデート設定も推奨）
sudo yum update -y
# 基本ツール
sudo yum install -y git docker awscli
# AWS CLI v2 install（明示的にv2をインストール）
if ! command -v aws &>/dev/null || [[ $(aws --version 2>&1) != aws-cli/2* ]]; then
  curl --fail --proto '=https' --tlsv1.2 -L "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
  unzip -o awscliv2.zip
  sudo ./aws/install --update
  rm -rf awscliv2.zip aws/
fi

# Session Manager Plugin
if ! command -v session-manager-plugin &>/dev/null; then
  curl --fail --proto '=https' --tlsv1.2 -L "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux/$(uname -m)/session-manager-plugin.rpm" -o session-manager-plugin.rpm
  sudo yum install -y session-manager-plugin.rpm
  rm -f session-manager-plugin.rpm
fi

# SSM Agent（Amazon Linux 2/2023は標準搭載だが念のため）
sudo yum install -y amazon-ssm-agent || true
sudo systemctl enable --now amazon-ssm-agent

# AWS Copilot CLI（ECS CLIは非推奨のため置換）
if ! command -v copilot &>/dev/null; then
  curl --fail --proto '=https' --tlsv1.2 -Lo copilot https://github.com/aws/copilot-cli/releases/latest/download/copilot-linux
  chmod +x copilot
  sudo mv copilot /usr/local/bin/copilot
fi

# eksctl
curl --fail --proto '=https' --tlsv1.2 --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" -o /tmp/eksctl.tar.gz
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
echo "[Tailscale] インストール開始: $(date)"
if ! command -v tailscale &>/dev/null; then
  curl --fail --proto '=https' --tlsv1.2 -fsSL https://pkgs.tailscale.com/stable/install.sh | sh
  if ! command -v tailscale &>/dev/null; then
    echo "[Tailscale] インストール失敗: tailscaleコマンドが見つかりません" >&2
    exit 1
  fi
fi
echo "[Tailscale] tailscaledサービス起動: $(date)"
sudo systemctl enable --now tailscaled
sudo systemctl status tailscaled --no-pager || true
# 認証キーがあれば自動ログイン
echo "[Tailscale] 認証処理: $(date)"
if [ -n "${TAILSCALE_AUTHKEY:-}" ]; then
  sudo tailscale up --authkey "$TAILSCALE_AUTHKEY" --ssh >/dev/null 2>&1 || {
    echo "[Tailscale] 認証失敗: tailscale up" >&2
    exit 1
  }
  echo "[Tailscale] 認証成功"
else
  echo "[Tailscale] 認証キー未設定。手動認証が必要です。"
fi
echo "[Tailscale] インストール・認証完了: $(date)"

# code-server install
curl --fail --proto '=https' --tlsv1.2 -fsSL https://code-server.dev/install.sh | sh
# code-serverのパスワードをランダム生成しファイルに保存（セキュリティ強化）
CODE_SERVER_PASS=$(openssl rand -base64 32)
echo "$CODE_SERVER_PASS" > /home/ec2-user/code-server-password.txt
chown ec2-user:ec2-user /home/ec2-user/code-server-password.txt
chmod 600 /home/ec2-user/code-server-password.txt
# セキュリティ警告: このファイルのパーミッション・管理には十分注意してください
# code-server systemd起動時の環境変数渡しを堅牢化
sudo mkdir -p /etc/systemd/system/code-server@ec2-user.service.d
sudo bash -c 'echo -e "[Service]\nEnvironment=PASSWORD=$(cat /home/ec2-user/code-server-password.txt)" > /etc/systemd/system/code-server@ec2-user.service.d/override.conf'
sudo chmod 600 /etc/systemd/system/code-server@ec2-user.service.d/override.conf
sudo systemctl daemon-reload
# code-serverをec2-userで起動
sudo systemctl enable --now code-server@ec2-user

# git worktree用ディレクトリ
mkdir -p /home/ec2-user/repos
chown ec2-user:ec2-user /home/ec2-user/repos
chmod 700 /home/ec2-user/repos

# --- dotfilesや初期セットアップ（AI自律化例）---
# 例: dotfilesリポジトリをクローンし、セットアップスクリプトを実行
# dotfilesのクローン時はssh-agentや一時鍵利用、パーミッション制御を徹底
if [ -n "${DOTFILES_REPO:-}" ]; then
  su - ec2-user -c "git clone --depth=1 --single-branch \"$DOTFILES_REPO\" /home/ec2-user/dotfiles && bash /home/ec2-user/dotfiles/setup.sh || true"
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
  xargs -a "$TOOL_LIST" sudo yum install -y || { echo "tools.txt経由のインストールに失敗しました"; exit 1; }
else
  # fallback: デフォルトリスト（失敗時はエラーで停止）
  sudo yum install -y zsh tmux htop jq tree unzip make gcc python3 nodejs yarn fzf bat ripgrep neovim || { echo "デフォルトツールのインストールに失敗"; exit 1; }
fi

# tools.txtの内容を自動インストール
TOOLS_TXT="/home/ec2-user/tools.txt"
if [ -f "$TOOLS_TXT" ]; then
  while read -r tool; do
    [[ "$tool" =~ ^#.*$ || -z "$tool" ]] && continue
    sudo yum install -y "$tool" || true
  done < "$TOOLS_TXT"
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

# --- tmux 設定: マウス操作・256色・バッファ拡張・クリップボード連携 ---
cat <<'EOF' > /home/ec2-user/.tmux.conf
set -g mouse on
set -g default-terminal "screen-256color"
set -g history-limit 10000
setw -g mode-keys vi
# クリップボード連携（Amazon Linux 2023/Ubuntu等でxclipがある場合）
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "xclip -selection clipboard -in"
EOF
chown ec2-user:ec2-user /home/ec2-user/.tmux.conf
chmod 644 /home/ec2-user/.tmux.conf

# --- tmux-resurrect & tmux-continuum インストール・自動保存設定 ---
# tmuxプラグインマネージャー (TPM) をインストール
if [ ! -d "/home/ec2-user/.tmux/plugins/tpm" ]; then
  sudo -u ec2-user git clone https://github.com/tmux-plugins/tpm /home/ec2-user/.tmux/plugins/tpm
fi
# tmux-resurrect, tmux-continuumはTPM経由で管理
# .tmux.confにプラグイン設定と自動保存有効化を追記
cat <<'EOF' >> /home/ec2-user/.tmux.conf
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'
set -g @continuum-restore 'on'
set -g @continuum-save-interval '5'
run '~/.tmux/plugins/tpm/tpm'
EOF
chown ec2-user:ec2-user /home/ec2-user/.tmux.conf

# tmux起動時に自動でプラグインインストール
sudo -u ec2-user bash -c 'tmux new-session -d "sleep 1" && /home/ec2-user/.tmux/plugins/tpm/bin/install_plugins && tmux kill-server'

# EC2自動停止時にセッション保存
cat <<'EOF' > /usr/local/bin/tmux-save-session.sh
#!/bin/bash
sudo -u ec2-user tmux run-shell "~/.tmux/plugins/tmux-resurrect/scripts/save.sh"
EOF
chmod +x /usr/local/bin/tmux-save-session.sh

# Lambda等によるEC2停止前にtmux-save-session.shを呼び出す設計例（UserData/READMEで案内）
# 例: /usr/local/bin/tmux-save-session.sh を停止前フックやSSM Automationで実行
