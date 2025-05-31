<!-- filepath: /Users/20m61/Documents/workspace/Ec2-dev-env-setup/README.md -->

# 🌱 EC2 Dev Environment Template with CDK + GitHub Actions

## 📚 目次（Table of Contents）

- [特徴](#特徴)
- [ディレクトリ構成](#ディレクトリ構成)
- [EC2にインストールされる主なツールと使い方](#ec2-にインストールされる主なツールと使い方)
- [前提条件](#前提条件)
- [セットアップ手順](#セットアップ手順)
- [シークレットの設定（GitHub）](#シークレットの設定github)
- [EC2キーペアの作成・SSH接続手順](#ec2-キーペアの作成ssh接続手順)
- [CLIツールの自動インストール・認証](#cli-ツールの自動インストール認証)
- [CDK構成](#cdk-構成)
- [GitHub Actionsデプロイ](#github-actions-デプロイgithubworkflowsdeployyml)
- [よくあるTips](#よくある-tips)
- [セキュリティグループのIP・ポート制御仕様](#セキュリティグループのipポート制御仕様)
- [スポットインスタンス運用](#スポットインスタンス運用)
- [S3バケット権限の最小化](#s3-バケット権限の最小化)
- [EC2自動停止スケジュール（サンプル）](#ec2-自動停止スケジュールサンプル)
- [バリデーション・セキュリティ強化](#バリデーションセキュリティ強化)
- [品質・CI/CD強化](#品質cicd強化)
- [クリーンアップ・リソース削除](#クリーンアップリソース削除)
- [まとめ](#まとめ)
- [コストシミュレーション](#コストシミュレーション)
- [必要なAWS権限（ポリシー例）](#必要な-aws-権限ポリシー例)
- [EC2接続情報CSV出力について](#ec2接続情報csv出力について)

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

## 🛠️ EC2にインストールされる主なツールと使い方

本テンプレートのEC2インスタンスでは、AWS CLI（awscli）に加え、以下のAWS関連コマンドも自動インストールされます。

| ツール名               | 主な用途・使い方例                                           |
| ---------------------- | ------------------------------------------------------------ |
| git                    | バージョン管理。`git clone`, `git worktree` など             |
| docker                 | コンテナ実行。`docker run`, `docker build` など              |
| docker compose         | 複数コンテナの管理。`docker compose up -d` など              |
| awscli                 | AWS 操作 CLI。`aws s3 ls`, `aws ec2 describe-instances` など |
| session-manager-plugin | SSMセッションマネージャ用CLI。`session-manager-plugin`       |
| amazon-ssm-agent       | SSMエージェント。EC2からSSM操作用                            |
| ecs-cli                | Amazon ECS CLI。`ecs-cli`                                    |
| eksctl                 | Amazon EKS クラスター管理CLI。`eksctl`                       |
| aws-cdk                | AWS CDK CLI。`cdk deploy` など                               |
| aws-sam-cli            | AWS SAM CLI。`sam build` `sam deploy` など                   |
| code-server            | ブラウザで VSCode。`http://<EC2-IP>:8080` でアクセス         |
| gh CLI                 | GitHub 操作 CLI。`gh repo clone`, `gh pr create` など        |
| gh copilot CLI         | GitHub Copilot CLI 拡張。`gh copilot` コマンド               |
| maxplan-cli            | Claude Code (Maxplan) API利用CLI。`maxplan chat` など        |
| claude-cli             | Claude API 利用 CLI（非推奨、Maxplanへ移行推奨）             |
| zsh                    | 高機能シェル。`chsh -s $(which zsh)` でデフォルト化          |
| tmux                   | ターミナル多重化。`tmux` で起動、`Ctrl+b` で操作             |
| htop                   | プロセス監視。`htop`                                         |
| jq                     | JSON 整形・抽出。`cat file.json \| jq .`                     |
| tree                   | ディレクトリ構造表示。`tree`                                 |
| unzip                  | zip 解凍。`unzip file.zip`                                   |
| make                   | ビルド自動化。`make`                                         |
| gcc                    | C/C++コンパイラ。`gcc main.c -o main`                        |
| python3                | Python 実行。`python3 script.py`                             |
| nodejs                 | Node.js 実行。`node app.js`                                  |
| n                      | Node.js バージョン管理。`sudo n lts` で LTS 版に切替         |
| yarn                   | Node.js パッケージ管理。`yarn install`, `yarn run`           |
| corepack               | Node.js 公式パッケージ管理ラッパー。`corepack enable`        |
| fzf                    | 高速ファジーファインダー。`fzf`                              |
| bat                    | cat の高機能版。`bat file.txt`                               |
| ripgrep                | 高速 grep。`rg pattern`                                      |
| neovim                 | 高機能エディタ。`nvim`                                       |

> それぞれの詳細な使い方は公式ドキュメントや `--help` オプションで確認できます。

---

## 📝 前提条件

- AWSアカウント（EC2, S3, IAM, CloudFormation等が利用可能な権限）
- macOS/Linux/Windows いずれかのPC
- Node.js（推奨: v18以上）
- npm（Node.jsに同梱、推奨: v9以上）
- AWS CLI（推奨: v2系）
- AWS CDK CLI（推奨: v2系、`npm install -g aws-cdk`）
- GitHub CLI（`gh`、推奨: v2系、`brew install gh` など）
- git

> ※バージョンは `node -v` `npm -v` `aws --version` `cdk --version` `gh --version` で確認できます。
>
> AWSリソース作成にはコストが発生します。不要になったリソースは必ず削除してください。

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
| `MAXPLAN_API_KEY`       | Maxplan CLI 用 API キー（公式でAPIキー発行がない場合は不要。利用時は各自で取得・設定）                                                                                   |
| `CLAUDE_API_KEY`        | Claude CLI 用 API キー（非推奨、Maxplanへ移行推奨）                                                                                                                      |
| `ALLOWED_IP`            | SSH/HTTPS/code-server の許可 IP（CIDR 表記）。例: `203.0.113.1/32`（単一 IP 許可）や `0.0.0.0/0`（全 IP 許可）。複数 IP を許可する場合は CIDR をカンマ区切りで指定。     |
| `SPOT_MAX_PRICE`        | スポットインスタンスの最大価格（USD/h）。例: `0.05`（最大 0.05 USD/h まで）。未指定の場合はオンデマンドインスタンスとして起動。価格は AWS のスポット価格を確認して設定。 |
| `KEY_PAIR_NAME`         | EC2用キーペア名（必須）。AWSコンソールやCLIで作成したキーペア名を指定。                                                                                                  |

> ⚠️ **注意:**
> GitHub Actions で AWS にデプロイするには、必ずリポジトリの「Settings > Secrets and variables > Actions > Secrets」に
> `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` を登録してください。
> `GITHUB_TOKEN` は EC2 上で gh/gh copilot CLI の認証に利用されます。
> `MAXPLAN_API_KEY` は Maxplan CLI 利用時に必要です（Maxplan を使う場合のみ）。
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

`KEY_PAIR_NAME` 環境変数またはGitHub Secretsでキーペア名を指定してください。CDKスタックは自動的にこの値を利用します。

例: .env または GitHub Secrets に

```
KEY_PAIR_NAME=my-key
```

を設定してください。

`lib/dev-env-stack.ts` の `ec2.Instance` 作成時は自動的に `keyName: process.env.KEY_PAIR_NAME` が利用されます。

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

- EC2 インスタンス起動時に `gh`（GitHub CLI）、`gh copilot` CLI は自動インストールされます。
- Maxplan（Claude Code）CLIは自動インストール対象外です。利用したい場合は各自で公式手順に従いインストール・認証設定を行ってください。
- Claude CLI/CLAUDE_API_KEY は非推奨です。
- Copilot CLI は `gh` の認証トークンを利用します。

> Maxplan（Claude Code）は、APIキーやCLIの利用方法は公式ドキュメントを参照し、各自でセットアップしてください。

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

## 🦄 Tailscale の自動インストール・認証

本テンプレートでは、EC2インスタンス起動時に Tailscale が自動インストール・自動起動されます。

- `.env` または GitHub Secrets で `TAILSCALE_AUTHKEY` を指定すると、インスタンス起動時に自動で Tailscale にログインし、SSH接続が有効化されます。
- `TAILSCALE_AUTHKEY` を指定しない場合は、EC2上で `sudo tailscale up --ssh` を手動実行してください。
- Tailscale経由でのみSSH(22番)が許可されるため、インターネットにポートを開放せず安全です。
- Tailscaleのベストプラクティス（公式: https://tailscale.com/ja/docs/ ）に準拠しています。

### .env/Secrets例

```
TAILSCALE_AUTHKEY=tskey-xxxxxxxxxxxxxxxxxxxx
```

### セットアップ手順（抜粋）

1. [Tailscale管理画面](https://login.tailscale.com/admin/settings/keys)で認証キーを発行
2. `.env` または GitHub Secrets に `TAILSCALE_AUTHKEY` を追加
3. デプロイ後、Tailscale管理画面でEC2がネットワークに参加していることを確認
4. Tailscale経由のIP（100.64.0.0/10）でSSH接続

---

## 🔒 セキュリティグループのIP・ポート制御仕様

本テンプレートのEC2インスタンスは、デフォルトでTailscale経由（100.64.0.0/10）からのSSH(22番)のみ許可されます。

- `ALLOWED_IP` と `SSH_PORT` の両方を指定した場合：
  - 指定したIP（CIDR）・指定したポートのみが許可されます。
  - 例: `ALLOWED_IP=203.0.113.1/32`, `SSH_PORT=2222` → 203.0.113.1/32 から 2222番ポートのみ許可
- `SSH_PORT` のみ指定した場合：
  - そのポートが全IP（0.0.0.0/0）に対して許可されます。
  - 例: `SSH_PORT=2022` → 2022番ポートが全IPに対して許可
- どちらも未指定の場合：
  - Tailscaleサブネット（100.64.0.0/10）からの22番ポートSSHのみ許可されます。
  - 外部（インターネット）からは一切アクセス不可です。

> **Tailscaleを利用することで、インターネットにポートを開放せずに安全にSSH接続できます。**
> Tailscaleのセットアップ方法やベストプラクティスは[公式ドキュメント](https://tailscale.com/ja/docs/)を参照してください。

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
- CDK出力物（`cdk.out/manifest.json`等）はAWS公式推奨のブートストラップ構成・ロール分離・アセット管理に準拠しています。
- `user-data.sh`はAWS公式CLIや推奨ツールのみを自動インストールし、不要な権限やパッケージを極力排除しています。
- セキュリティグループのIP/ポート制御仕様はテストコード（`test/dev-env-stack.test.ts`）で網羅的に検証されています。
- `user-data.sh`で`sudo usermod -aG docker ec2-user`を実行し、ec2-userでsudo無しでdockerコマンドが利用可能です。
- `code-server`は初回起動時にランダムなパスワードが自動生成され、`/home/ec2-user/code-server-password.txt`に保存されます。パスワードは環境変数経由で設定され、セキュリティを強化しています。
- **code-serverのパスワードは必ず安全に管理し、第三者に漏洩しないよう注意してください。パブリックIPでアクセスする場合はセキュリティグループやVPC、VPN等でアクセス制限を必ず行ってください。**

## 🧪 品質・CI/CD強化

- `eslint`/`prettier`/`jest`による静的解析・自動整形・テストが追加されています。
- `npm run lint`/`npm run format`/`npm test` で品質チェックが可能です。
- GitHub Actionsでも自動でlint/testが実行されます。
- CI/CDパイプラインはCDKのベストプラクティス（ロール分離・アセットS3管理・検証フロー）に準拠しています。
- テスト・静的解析・自動整形は全てパスしており、継続的な品質担保が可能です。

---

## 🧹 クリーンアップ・リソース削除

- 不要になったEC2インスタンスやEBS、S3バケット等はAWSマネジメントコンソールや `cdk destroy` コマンドで削除してください。
- `cdk destroy` でCDKスタック全体を削除できます。
- S3バケットやIAMロールなど一部リソースは手動削除が必要な場合があります。
- 削除漏れがあるとコストが継続発生するため、必ずご確認ください。

---

## 🧙‍♀️ まとめ

> 💎 Graviton で爆速＆激安、S3 も SSM も使えて、git worktree で並列作業も OK！
>
> ⏳ CloudWatch で CPU やネットワークのアイドル状態を検知し、Lambda で EC2 を自動停止することで「使った分だけ」安価に運用できます。
> 例: 30分間 CPU 利用率が 5% 未満なら自動停止。停止後も EBS 上に作業内容は保持され、再起動でレジューム可能です。
> tmux や screen でセッション保存、S3/EBS でデータ永続化も推奨。
> 詳細な自動停止設定例は AWS 公式ドキュメントや CDK サンプルを参照してください。
> 完全なテンプレート化で、開発環境の構築が「ボタンひとつ」でできる世界を実現します ✨

---

## 💰 コストシミュレーション

本テンプレートの代表的なAWSリソース構成（EC2 t4g.xlarge, 100GB gp3 EBS, 東京リージョン等）は、
[AWS Pricing Calculatorの共有見積もりリンク](https://calculator.aws/#/estimate?id=68ab2b06136098be931a29dcc0b963da7253358d) から、
ダイレクトにコスト試算できます。

> ※ 実際の利用状況や追加リソースに応じて金額は変動します。必要に応じて見積もり内容を編集してください。

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
        "logs:*",
        "ecs:*", // ECS CLI, CDK で ECS を使う場合
        "eks:*", // eksctl, CDK で EKS を使う場合
        "lambda:*", // SAM CLI, CDK で Lambda を使う場合
        "cloudwatch:*" // CloudWatch Logs, Events など
      ],
      "Resource": "*"
    }
  ]
}
```

- **最小権限運用を推奨します。**
- S3 バケット名やリソースを限定する場合は `"Resource"` を適宜制限してください。
- `iam:PassRole` には CDK で作成するロールの ARN を指定するのがベストです。
- ECS/EKS/Lambda/SAM/CloudWatch など AWS サービスを利用する場合は、必要に応じて該当サービスの権限を追加してください。

---

## 📝 EC2接続情報CSV出力について

CDKデプロイ完了後、EC2への接続情報を `ec2-connection-info.csv` としてリポジトリ直下に出力してください。以下は自動生成用のサンプルスクリプトです：

### CSVフォーマット例

| InstanceId | PublicIp     | User     | KeyName | Region         | SSHCommand                                     | CreatedAt            |
| ---------- | ------------ | -------- | ------- | -------------- | ---------------------------------------------- | -------------------- |
| i-xxxxxxxx | 203.0.113.10 | ec2-user | my-key  | ap-northeast-1 | "ssh -i keys/my-key.pem ec2-user@203.0.113.10" | 2025-05-31T12:34:56Z |

```csv
InstanceId,PublicIp,User,KeyName,Region,SSHCommand,CreatedAt
i-xxxxxxxx,203.0.113.10,ec2-user,my-key,ap-northeast-1,"ssh -i keys/my-key.pem ec2-user@203.0.113.10",2025-05-31T12:34:56Z
```

- `User` は Amazon Linux の場合 `ec2-user` です。
- `KeyName` はCDKで指定したキーペア名。
- `SSHCommand` は実際の接続コマンド例。
- `CreatedAt` は出力時のUTC日時。

> このファイルは `.gitignore` によりGit管理対象外です。

---

## ⚠️ 注意事項

- AWSリソース作成にはコストが発生します。不要になったリソースは必ず削除してください。
- 秘密鍵（.pemファイル）は安全に保管し、第三者に渡さないでください。
- セキュリティのため、秘密鍵は絶対にリポジトリにコミットしないでください。

---

## 🔗 参考リンク

- [AWS 公式ドキュメント](https://docs.aws.amazon.com/ja_jp/)
- [AWS CDK 公式ドキュメント](https://docs.aws.amazon.com/cdk/latest/guide/home.html)
- [GitHub Actions 公式ドキュメント](https://docs.github.com/ja/actions)
- [code-server 公式](https://github.com/coder/code-server)
- [Maxplan CLI 公式](https://github.com/maxplan-io/cli)
- [Claude API 公式](https://console.anthropic.com/)

---
