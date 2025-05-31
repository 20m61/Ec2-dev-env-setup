#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DevEnvStack } from '../lib/dev-env-stack';

const app = new cdk.App();
new DevEnvStack(app, 'DevEnvStack', {
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  /*
    デプロイ先アカウントやリージョンを明示したい場合は上記envを有効化してください。
    例: env: { account: '123456789012', region: 'ap-northeast-1' }
  */
});
