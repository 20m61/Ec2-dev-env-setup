# 🌱 EC2 Dev Environment Template with CDK + GitHub Actions

Amazon EC2（Graviton）と AWS CDK、GitHub Actions を使って、コスパ最強・快適・セキュアな開発環境を構築するテンプレートです。

## ✅ 特徴

- 💻 **Graviton (ARM) インスタンス** を利用したコスト効率の良い開発環境
- 🔐 IAM ロールと SSM + S3 アクセス権を自動設定
- 📦 100GB EBS 付き（`gp3`）で `git worktree` や Docker にも対応
- ⚙️ CDK でインフラ構築、GitHub Actions でデプロイ自動化
- 🪄 スポットインスタンス運用にも対応可能（後述）

---

## 📁 ディレクトリ構成

```bash
.
├── bin/
│   └── dev-env.ts
├── lib/
│   └── dev-env-stack.ts
├── templates/
│   └── user-data.sh
├── .github/workflows/deploy.yml
├── cdk.json
├── package.json
├── README.md
└── tsconfig.json
```

---

## 🚀 セットアップ手順

### 1. リポジトリ作成 & 初期化

```bash
git clone https://github.com/YOUR_NAME/ec2-dev-env-template.git
cd ec2-dev-env-template
npm install
```

---

### 2. シークレットの設定（GitHub）

| シークレット名          | 内容                                  |
| ----------------------- | ------------------------------------- |
| `AWS_ACCESS_KEY_ID`     | IAM ユーザーのアクセスキー            |
| `AWS_SECRET_ACCESS_KEY` | 同上                                  |
| `AWS_REGION`            | 例：`ap-northeast-1`                  |
| `PROJECT_BUCKET_NAME`   | S3 バケット名（任意）                 |
| `GITHUB_TOKEN`          | GitHub CLI/Copilot 用トークン（必須） |
| `CLAUDE_API_KEY`        | Claude CLI 用 API キー（任意）        |

> ⚠️ **注意:**
> GitHub Actions で AWS にデプロイするには、必ずリポジトリの「Settings > Secrets and variables > Actions > Secrets」に
> `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` を登録してください。
> `GITHUB_TOKEN` は EC2 上で gh/gh copilot CLI の認証に利用されます。
> `CLAUDE_API_KEY` は Claude CLI 利用時に必要です（Claude を使う場合のみ）。
> MCP（Model Context Protocol）はプロトコル仕様であり、特定の CLI や共通トークン（MCP_TOKEN）は存在しません。利用したい MCP サーバーやクライアント（例: GitHub, Notion, DB, Claude Desktop 等）ごとに、各実装の公式手順に従ってインストール・設定・認証情報（API キー等）を用意してください。
> これらが未設定の場合、一部機能が利用できません。

---

### 3. CLI ツールの自動インストール・認証

- EC2 インスタンス起動時に `gh`（GitHub CLI）、`gh copilot`、`claude` CLI も自動インストールされます。
- `.env` ファイルに `GITHUB_TOKEN` や `CLAUDE_API_KEY` を記載しておくと、初回起動時に自動で認証・設定されます。
- Copilot CLI は `gh` の認証トークンを利用します。
- Claude CLI は `CLAUDE_API_KEY` を `~/.bashrc` に自動で追記します。
- MCP を利用したい場合は、利用したい MCP サーバー/クライアントの公式手順に従い、必要な OSS やサービスを各自インストール・設定してください。

---

### 4. CDK 構成

#### `lib/dev-env-stack.ts`

- `t4g.xlarge`（16GB RAM / Graviton）を使用
- 100GB `gp3` EBS
- Amazon Linux 2023 ARM64 AMI
- S3 アクセス、SSM アクセス可能な IAM ロール付与

#### `user-data.sh`

- `git` / `awscli` / `docker` / `code-server` などを自動インストール
- `git worktree` 展開用の初期処理も追加可

---

### 5. GitHub Actions デプロイ（`.github/workflows/deploy.yml`）

```yaml
name: Deploy EC2 Environment

on:
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
      - run: npm ci
      - run: npx cdk deploy --require-approval never
```

---

## 💡 よくある Tips

### スポットインスタンスにしたい場合：

- `ec2.Instance` にスポットオプション追加
- `instanceMarketOptions` を指定（必要ならコード提供します）

### 自動停止スケジュール：

- Lambda + EventBridge で 23 時に自動停止なども可

### git worktree 対応:

- `/home/ec2-user/repos` に複数ブランチ展開
- `user-data.sh`で自動生成も可能

---

## 📦 TODO（今後の拡張）

- [ ] `bootstrap.sh` で一発セットアップ
- [ ] OIDC で GitHub Actions からロール連携
- [ ] CloudWatch ログ収集設定

---

## 🧙‍♀️ まとめ

> 💎 Graviton で爆速＆激安、S3 も SSM も使えて、git worktree で並列作業も OK！
> 完全なテンプレート化で、開発環境の構築が「ボタンひとつ」でできる世界を実現します ✨

---

## 🛡️ 必要な AWS 権限（ポリシー例）

CDK デプロイや EC2 環境構築に必要な最小限の権限例です。IAM ユーザーまたは GitHub Actions 用ロールに以下の権限を付与してください。

### 管理ポリシー例（JSON）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:*",
        "iam:PassRole",
        "iam:GetRole",
        "iam:CreateRole",
        "iam:AttachRolePolicy",
        "iam:PutRolePolicy",
        "cloudformation:*",
        "ssm:*",
        "s3:*",
        "logs:*"
      ],
      "Resource": "*"
    }
  ]
}
```

- **最小権限運用を推奨します。**
- S3 バケット名を限定する場合は `"Resource"` を適宜制限してください。
- `iam:PassRole` には CDK で作成するロールの ARN を指定するのがベストです。
