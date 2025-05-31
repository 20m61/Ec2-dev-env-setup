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
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
    );
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));

    // セキュリティグループ
    const allowedIp = process.env.ALLOWED_IP || this.node.tryGetContext('ALLOWED_IP');
    // CIDR形式バリデーション
    const cidrRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/;
    if (allowedIp && !allowedIp.split(',').every((ip: string) => cidrRegex.test(ip.trim()))) {
      throw new Error(`ALLOWED_IPはCIDR形式で指定してください: ${allowedIp}`);
    }
    const sshSource = allowedIp ? ec2.Peer.ipv4(allowedIp) : ec2.Peer.anyIpv4();
    const sg = new ec2.SecurityGroup(this, 'DevEnvSG', {
      vpc,
      allowAllOutbound: true,
      description: 'Allow SSH and HTTPS',
    });
    sg.addIngressRule(sshSource, ec2.Port.tcp(22), 'Allow SSH');
    sg.addIngressRule(sshSource, ec2.Port.tcp(443), 'Allow HTTPS');
    sg.addIngressRule(sshSource, ec2.Port.tcp(8080), 'Allow code-server');

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
        deleteOnTermination: true, // インスタンス削除時にEBSも削除
      }),
    };

    // user-data
    const userData = fs.readFileSync(path.join(__dirname, '../templates/user-data.sh'), 'utf8');

    // EC2 Instance
    const spotMaxPrice = this.node.tryGetContext('SPOT_MAX_PRICE') || process.env.SPOT_MAX_PRICE;
    const instance = new ec2.Instance(this, 'DevEnvInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.XLARGE),
      machineImage: ami,
      securityGroup: sg,
      role,
      blockDevices: [ebs],
      userData: ec2.UserData.custom(userData),
      ...(spotMaxPrice && {
        spotPrice: spotMaxPrice,
      }),
    });

    // S3バケット（任意）
    const bucketName =
      process.env.PROJECT_BUCKET_NAME || this.node.tryGetContext('PROJECT_BUCKET_NAME');
    // S3バケット名バリデーション
    const bucketNameRegex = /^[a-z0-9.-]{3,63}$/;
    if (bucketName && !bucketNameRegex.test(bucketName)) {
      throw new Error(`S3バケット名が不正です: ${bucketName}`);
    }
    if (bucketName) {
      const bucket = new s3.Bucket(this, 'ProjectBucket', {
        bucketName,
        removalPolicy: cdk.RemovalPolicy.DESTROY, // スタック削除時にバケットも削除
        autoDeleteObjects: true, // バケット内の全オブジェクトも削除
      });
      // S3バケット単位の権限のみ付与
      role.addToPolicy(
        new iam.PolicyStatement({
          actions: ['s3:*'],
          resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
        }),
      );
    }
    // CloudWatch Logs等を追加する場合もremovalPolicy: DESTROYを必ず指定してください

    // EC2 Nameタグ付与
    instance.instance.addPropertyOverride('Tags', [{ Key: 'Name', Value: id }]);
  }
}
