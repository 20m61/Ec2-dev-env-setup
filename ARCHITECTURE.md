# AWS EC2 Dev Environment CDK自動化ワークフロー: 統括ドキュメント

## 概要

本プロジェクトは、AWS CDKを用いてEC2ベースの開発環境を完全自動化・CI/CD対応で構築することを目的としています。Tailscale, code-server, docker等のセットアップ、.envファイルの安全な受け渡し、S3バケット分離、SSMによる検証自動化など、現代的なIaC/DevOpsベストプラクティスを徹底しています。

---

## これまでの対応内容

### 1. .envファイルの安全な受け渡し

- .envをUserDataに直接埋め込む方式を廃止し、S3バケット経由で受け渡す設計に変更。
- S3バケットはCDKで専用Stack（S3BucketStack）として分離し、EC2側（DevEnvStack）から参照。
- .envのアップロードはnpm script/CI/CDで自動化。

### 2. CDK Split-Stack設計

- S3バケットとEC2リソースを完全に分離した2スタック構成。
- DevEnvStackはS3バケット名をprops経由で受け取り、依存性を明示。
- テスト・デプロイ・npm scriptも全て新構成に対応。

### 3. UserData/環境構築の堅牢化

- UserDataはMultipart構造で、1パート目で.envをS3からダウンロード、2パート目で本体セットアップ。
- ログ出力・エラー処理・リトライ・権限設定を強化。
- .envの内容・パーミッションも厳格にチェック。

### 4. SSMによる自動検証

- tools/ssm_check.shを新規作成し、Tailscale/docker/code-server等のセットアップ状況をSSM経由で一括検証。
- npm scriptからワンコマンドで検証可能。
- SSM/lessページャ回避TipsもREADMEに明記。

### 5. CI/CD・運用自動化

- README, npm script, CloudFormation Outputs, SSM検証まで一貫して自動化。
- CloudFormation ROLLBACK時の手動復旧手順も明記。
- SSH接続情報生成・SSM経由運用もサポート。

### 6. セキュリティ・運用

- .envはS3バケット経由でのみ受け渡し、UserDataサイズ・リークリスクを回避。
- EC2にはTailscale経由SSHを推奨、ALLOWED_IP/SSH_PORTも柔軟に設定可能。
- CloudWatch/Lambdaによるアイドル時自動停止も実装。

---

## 現状の課題

- UserData Multipart構造の2パート目が一部環境で実行されない場合がある（CDK/CloudFormation仕様・OS差異等）。
- SSM経由での検証は正常だが、cloud-initログ等で2パート目の実行有無を常に確認する必要あり。
- .envのクレデンシャル管理・ローテーションは運用側で徹底する必要。
- SSH接続情報生成（ec2_ssh_config）はPublicIP出力を廃止したため、SSM経由運用が推奨。

---

## 今後の方針

1. **UserData 2パート目の確実な実行保証**
   - cloud-init, OS, CDKバージョン差異による挙動差を調査し、必要に応じてUserData構造を再設計。
   - 2パート目の先頭に明示的なログ出力を追加し、実行有無を常時検証。
2. **CI/CD自動検証の強化**
   - ssm_check.shの出力をCI/CDで自動判定し、セットアップ失敗時は即アラート。
   - .envの内容・権限・S3バケットのセキュリティもCIで自動チェック。
3. **セキュリティ運用の徹底**
   - .envのクレデンシャルは定期的にローテーション。
   - S3バケットのアクセス権限・暗号化・バージョニングを強化。
   - EC2のSSHはTailscale/SSM経由を原則とし、PublicIP経由は最小限に。
4. **ドキュメント・運用Tipsの充実**
   - README/運用ドキュメントにSSM/less回避・CloudFormation復旧・SSH/SSM運用Tipsを明記。
   - トラブルシューティング例・よくある質問も追記。

---

## 参考: .envサンプル

```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-northeast-1
KEY_PAIR_NAME=...
GITHUB_TOKEN=...
TAILSCALE_AUTHKEY=...
```

---

## まとめ

本プロジェクトは、AWS CDKによるEC2開発環境の自動化・堅牢化・CI/CD運用を実現するためのベストプラクティスを集約しています。今後もUserData/SSM/セキュリティ運用の改善を継続し、より安全・確実なIaC/DevOps基盤を目指します。
