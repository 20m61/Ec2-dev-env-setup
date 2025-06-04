import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

export interface S3BucketStackProps extends cdk.StackProps {
  resourcePrefix: string;
  bucketName?: string;
}

export class S3BucketStack extends cdk.Stack {
  public readonly envBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: S3BucketStackProps) {
    super(scope, id, props);

    const bucketName =
      props.bucketName ||
      `${props.resourcePrefix}-envbucket`
        .toLowerCase()
        .replace(/[^a-z0-9.-]/g, '')
        .slice(0, 63);

    this.envBucket = new s3.Bucket(this, `${props.resourcePrefix}-EnvBucket`, {
      bucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new cdk.CfnOutput(this, 'EnvBucketName', {
      value: this.envBucket.bucketName,
      description: 'S3 bucket for environment files',
    });
  }
}
