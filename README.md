# 🌱 EC2 Dev Environment Template with CDK + GitHub Actions

Amazon EC2（Graviton）とAWS CDK、GitHub Actionsを使って、コスパ最強・快適・セキュアな開発環境を構築するテンプレートです。

## ✅ 特徴

- 💻 **Graviton (ARM) インスタンス** を利用したコスト効率の良い開発環境
- 🔐 IAMロールと SSM + S3 アクセス権を自動設定
- 📦 100GB EBS付き（`gp3`）で `git worktree` や Docker にも対応
- ⚙️ CDKでインフラ構築、GitHub Actionsでデプロイ自動化
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

| シークレット名 | 内容 |
|----------------|------|
| `AWS_ACCESS_KEY_ID` | IAMユーザーのアクセスキー |
| `AWS_SECRET_ACCESS_KEY` | 同上 |
| `AWS_REGION` | 例：`ap-northeast-1` |
| `PROJECT_BUCKET_NAME` | S3バケット名（任意） |

---

### 3. CDK構成

#### `lib/dev-env-stack.ts`

- `t4g.xlarge`（16GB RAM / Graviton）を使用
- 100GB `gp3` EBS
- Amazon Linux 2023 ARM64 AMI
- S3アクセス、SSMアクセス可能なIAMロール付与

#### `user-data.sh`

- `git` / `awscli` / `docker` / `code-server` などを自動インストール
- `git worktree` 展開用の初期処理も追加可

---

### 4. GitHub Actionsデプロイ（`.github/workflows/deploy.yml`）

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

## 💡 よくあるTips

### スポットインスタンスにしたい場合：
- `ec2.Instance` にスポットオプション追加
- `instanceMarketOptions` を指定（必要ならコード提供します）

### 自動停止スケジュール：
- Lambda + EventBridge で23時に自動停止なども可

### git worktree対応:
- `/home/ec2-user/repos` に複数ブランチ展開
- `user-data.sh`で自動生成も可能

---

## 📦 TODO（今後の拡張）

- [ ] `bootstrap.sh` で一発セットアップ
- [ ] OIDCでGitHub Actionsからロール連携
- [ ] CloudWatchログ収集設定

---

## 🧙‍♀️ まとめ

> 💎 Gravitonで爆速＆激安、S3もSSMも使えて、git worktreeで並列作業もOK！
> 完全なテンプレート化で、開発環境の構築が「ボタンひとつ」でできる世界を実現します ✨
