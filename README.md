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

## 🛠️ EC2 にインストールされる主なツールと使い方

| ツール名       | 主な用途・使い方例                                           |
| -------------- | ------------------------------------------------------------ | ----- |
| git            | バージョン管理。`git clone`, `git worktree` など             |
| docker         | コンテナ実行。`docker run`, `docker build` など              |
| docker compose | 複数コンテナの管理。`docker compose up -d` など              |
| awscli         | AWS 操作 CLI。`aws s3 ls`, `aws ec2 describe-instances` など |
| code-server    | ブラウザで VSCode。`http://<EC2-IP>:8080` でアクセス         |
| gh CLI         | GitHub 操作 CLI。`gh repo clone`, `gh pr create` など        |
| gh copilot CLI | GitHub Copilot CLI 拡張。`gh copilot` コマンド               |
| claude CLI     | Claude API 利用 CLI。`claude chat` など                      |
| zsh            | 高機能シェル。`chsh -s $(which zsh)` でデフォルト化          |
| tmux           | ターミナル多重化。`tmux` で起動、`Ctrl+b` で操作             |
| htop           | プロセス監視。`htop`                                         |
| jq             | JSON 整形・抽出。`cat file.json                              | jq .` |
| tree           | ディレクトリ構造表示。`tree`                                 |
| unzip          | zip 解凍。`unzip file.zip`                                   |
| make           | ビルド自動化。`make`                                         |
| gcc            | C/C++コンパイラ。`gcc main.c -o main`                        |
| python3        | Python 実行。`python3 script.py`                             |
| nodejs         | Node.js 実行。`node app.js`                                  |
| n              | Node.js バージョン管理。`sudo n lts` で LTS 版に切替         |
| yarn           | Node.js パッケージ管理。`yarn install`, `yarn run`           |
| corepack       | Node.js 公式パッケージ管理ラッパー。`corepack enable`        |
| fzf            | 高速ファジーファインダー。`fzf`                              |
| bat            | cat の高機能版。`bat file.txt`                               |
| ripgrep        | 高速 grep。`rg pattern`                                      |
| neovim         | 高機能エディタ。`nvim`                                       |

> それぞれの詳細な使い方は公式ドキュメントや `--help` オプションで確認できます。

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

| シークレット名          | 内容                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AWS_ACCESS_KEY_ID`     | IAM ユーザーのアクセスキー                                                                                                                                               |
| `AWS_SECRET_ACCESS_KEY` | 同上                                                                                                                                                                     |
| `AWS_REGION`            | 例：`ap-northeast-1`                                                                                                                                                     |
| `PROJECT_BUCKET_NAME`   | S3 バケット名（任意）                                                                                                                                                    |
| `GITHUB_TOKEN`          | GitHub CLI/Copilot 用トークン（必須）                                                                                                                                    |
| `CLAUDE_API_KEY`        | Claude CLI 用 API キー（任意）                                                                                                                                           |
| `ALLOWED_IP`            | SSH/HTTPS/code-server の許可 IP（CIDR 表記）。例: `203.0.113.1/32`（単一 IP 許可）や `0.0.0.0/0`（全 IP 許可）。複数 IP を許可する場合は CIDR をカンマ区切りで指定。     |
| `SPOT_MAX_PRICE`        | スポットインスタンスの最大価格（USD/h）。例: `0.05`（最大 0.05 USD/h まで）。未指定の場合はオンデマンドインスタンスとして起動。価格は AWS のスポット価格を確認して設定。 |

> ⚠️ **注意:**
> GitHub Actions で AWS にデプロイするには、必ずリポジトリの「Settings > Secrets and variables > Actions > Secrets」に
> `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` を登録してください。
> `GITHUB_TOKEN` は EC2 上で gh/gh copilot CLI の認証に利用されます。
> `CLAUDE_API_KEY` は Claude CLI 利用時に必要です（Claude を使う場合のみ）。
> MCP（Model Context Protocol）はプロトコル仕様であり、特定の CLI や共通トークン（MCP_TOKEN）は存在しません。利用したい MCP サーバーやクライアント（例: GitHub, Notion, DB, Claude Desktop 等）ごとに、各実装の公式手順に従ってインストール・設定・認証情報（API キー等）を用意してください。
> これらが未設定の場合、一部機能が利用できません。

---

### 2.5. EC2 キーペアの作成・SSH接続手順

このテンプレートでは、EC2インスタンスへSSH接続するためのキーペア（秘密鍵）は自動生成されません。以下の手順でご自身で作成・設定してください。

#### 1. キーペアの作成

AWSコンソールまたはCLIでキーペア（.pemファイル）を作成します。

```bash
aws ec2 create-key-pair --key-name my-key --query 'KeyMaterial' --output text > my-key.pem
chmod 600 my-key.pem
```

#### 2. CDKスタックでキーペア名を指定

`lib/dev-env-stack.ts` の `ec2.Instance` 作成時に `keyName` プロパティを追加してください。

```ts
const instance = new ec2.Instance(this, 'DevEnvInstance', {
  // ...existing code...
  keyName: 'my-key', // 作成したキーペア名
  // ...existing code...
});
```

#### 3. EC2のパブリックIPアドレスを確認

AWSコンソールや `aws ec2 describe-instances` コマンドでパブリックIPを確認します。

#### 4. SSH接続

```bash
ssh -i my-key.pem ec2-user@<EC2のパブリックIP>
```

> ※ 秘密鍵（.pemファイル）は安全に保管し、第三者に渡さないでください。

---

### 2.6. キーペア（\*.pemファイル）の配置とワークフロー利用

- 作成したEC2用キーペア（例: `my-key.pem`）は、リポジトリ直下の `keys/` ディレクトリに配置してください。
- `keys/` ディレクトリと `*.pem` ファイルは `.gitignore` によりGit管理対象外となっており、公開されません。
- GitHub Actions等のワークフローで秘密鍵を利用する場合は、`keys/my-key.pem` を参照してください。

> ⚠️ セキュリティのため、秘密鍵は絶対にリポジトリにコミットしないでください。

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

## 🔒 セキュリティグループの IP 制限

デフォルトでは全 IP 許可ですが、`ALLOWED_IP` 環境変数（例: `203.0.113.1/32`）を指定すると、その IP のみ SSH/HTTPS/8080 が許可されます。

---

## 💸 スポットインスタンス運用

`SPOT_MAX_PRICE` 環境変数を指定すると、EC2 がスポットインスタンスとして起動します。

- 例: `SPOT_MAX_PRICE=0.05` で最大 0.05USD/h まで
- 未指定ならオンデマンド

---

## 🛡️ S3 バケット権限の最小化

S3 バケットを作成した場合、IAM ロールにはそのバケット単位の権限のみが付与されます。

- `AmazonS3FullAccess`は不要になり、セキュリティが向上します。
- 既存バケットを使う場合は、必要に応じて権限を調整してください。

---

## ⏰ EC2 自動停止スケジュール（サンプル）

コスト削減のため、EventBridge + Lambda で自動停止が可能です。

```ts
// CDK例: 毎日23時にEC2を停止
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';

const stopInstanceFn = new lambda.Function(this, 'StopInstanceFn', {
  runtime: lambda.Runtime.PYTHON_3_11,
  handler: 'index.handler',
  code: lambda.Code.fromInline(`
import boto3
def handler(event, context):
  ec2 = boto3.client('ec2')
  ec2.stop_instances(InstanceIds=['i-xxxxxxxxxxxxxxxxx'])
`),
  environment: { INSTANCE_ID: instance.instanceId },
});
new events.Rule(this, 'StopInstanceRule', {
  schedule: events.Schedule.cron({ minute: '0', hour: '14' }), // UTC+9=23時
  targets: [new targets.LambdaFunction(stopInstanceFn)],
});
```

### ⚠️ 自動停止時の注意点

- 自動停止時、EC2 上で実行中のプロセスや作業は**強制的に中断**されます。
- 保存していないデータや未 push のコードは失われる可能性があります。
- 重要な作業は**こまめに保存・git/S3 等にバックアップ**してください。
- スポットインスタンスも同様に、AWS 側都合で中断される場合があります。

---

## 🛡️ バリデーション・セキュリティ強化

- `ALLOWED_IP`（CIDR形式）や `PROJECT_BUCKET_NAME`（S3命名規則）のバリデーションをCDKで自動チェックします。
- 不正な値の場合はデプロイ時にエラーとなります。
- EC2インスタンスにはNameタグが自動付与されます。

## 🧪 品質・CI/CD強化

- `eslint`/`prettier`/`jest`による静的解析・自動整形・テストが追加されています。
- `npm run lint`/`npm run format`/`npm test` で品質チェックが可能です。
- GitHub Actionsでも自動でlint/testが実行されます。

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
