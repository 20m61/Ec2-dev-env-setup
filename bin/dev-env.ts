#!/usr/bin/env node
import 'source-map-support/register';
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { DevEnvStack } from '../lib/dev-env-stack';
import { S3BucketStack } from '../lib/s3-bucket-stack';

const app = new cdk.App();

// 共通prefixやenv名をcontext/envから取得
const envName = process.env.ENV_NAME || app.node.tryGetContext('ENV_NAME') || 'dev';
const stackName = 'devenvstack';
const resourcePrefix = `${stackName}-${envName}`;
const bucketName = process.env.PROJECT_BUCKET_NAME || app.node.tryGetContext('PROJECT_BUCKET_NAME');

// 1. S3バケットスタック
const s3Stack = new S3BucketStack(app, 'S3BucketStack', {
  resourcePrefix,
  bucketName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// 2. EC2/その他リソーススタック
new DevEnvStack(app, 'DevEnvStack', {
  envBucket: s3Stack.envBucket,
  resourcePrefix,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
