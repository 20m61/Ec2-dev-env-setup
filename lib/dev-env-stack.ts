import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as fs from 'fs';
import * as path from 'path';

export class DevEnvStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'DevEnvVpc', {
      maxAzs: 2,
      natGateways: 1,
    });

    // IAMロール
    const role = new iam.Role(this, 'DevEnvRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess')
    );

    // セキュリティグループ
    const sg = new ec2.SecurityGroup(this, 'DevEnvSG', {
      vpc,
      allowAllOutbound: true,
      description: 'Allow SSH and HTTPS',
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS');
    sg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'Allow code-server'
    );

    // Amazon Linux 2023 ARM64 AMI
    const ami = ec2.MachineImage.latestAmazonLinux({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      edition: ec2.AmazonLinuxEdition.STANDARD,
    });

    // EBS
    const ebs = {
      deviceName: '/dev/xvda',
      volume: ec2.BlockDeviceVolume.ebs(100, {
        volumeType: ec2.EbsDeviceVolumeType.GP3,
      }),
    };

    // user-data
    const userData = fs.readFileSync(
      path.join(__dirname, '../templates/user-data.sh'),
      'utf8'
    );

    // EC2 Instance
    const instance = new ec2.Instance(this, 'DevEnvInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.XLARGE
      ),
      machineImage: ami,
      securityGroup: sg,
      role,
      blockDevices: [ebs],
      userData: ec2.UserData.custom(userData),
    });

    // S3バケット（任意）
    const bucketName =
      process.env.PROJECT_BUCKET_NAME ||
      this.node.tryGetContext('PROJECT_BUCKET_NAME');
    if (bucketName) {
      new s3.Bucket(this, 'ProjectBucket', {
        bucketName,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });
    }
  }
}
