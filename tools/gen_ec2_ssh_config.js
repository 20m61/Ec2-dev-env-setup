#!/usr/bin/env node
// tools/gen_ec2_ssh_config.js
// CloudFormation Outputsとec2-connection-info.csvからtools/ec2_ssh_configを自動生成

const fs = require('fs');
const path = require('path');

// CSVから情報取得
const csvPath = path.join(__dirname, '../ec2-connection-info.csv');
const configPath = path.join(__dirname, 'ec2_ssh_config');

if (!fs.existsSync(csvPath)) {
    console.error('ec2-connection-info.csv が見つかりません。cdk deploy 後に再実行してください。');
    process.exit(1);
}

const csv = fs.readFileSync(csvPath, 'utf-8').split('\n');
if (csv.length < 2) {
    console.error('ec2-connection-info.csv に有効なデータがありません。');
    process.exit(1);
}
const [header, row] = csv;
const cols = header.split(',');
const vals = row.split(',');
if (!row || vals.length !== cols.length || vals.every(v => v === '')) {
    console.error('ec2-connection-info.csv のデータ行が不正です。');
    process.exit(1);
}
const get = (key) => vals[cols.indexOf(key)] || '';

const INSTANCE_ID = get('InstanceId');
const KEY_NAME = get('KeyName');
const USER = get('User') || 'ec2-user';
const REGION = get('Region');
const PUBLIC_IP = get('PublicIp');
const KEY_PATH = KEY_NAME ? `../keys/${KEY_NAME}.pem` : '../keys/my-key.pem';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';

const config = `# EC2 SSH スクリプト用設定ファイル（自動生成）\nINSTANCE_ID="${INSTANCE_ID}"\nKEY_PATH="${KEY_PATH}"\nUSER="${USER}"\nREGION="${REGION}"\nAWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"\nAWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"\nAWS_DEFAULT_REGION="${REGION}"\nPUBLIC_IP="${PUBLIC_IP}"\n`;

fs.writeFileSync(configPath, config, { encoding: 'utf-8' });
console.log(`tools/ec2_ssh_config を自動生成しました: ${configPath}`);
