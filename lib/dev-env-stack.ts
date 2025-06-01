import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

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
    const sshPort = parseInt(
      process.env.SSH_PORT || this.node.tryGetContext('SSH_PORT') || '22',
      10,
    );
    // CIDR形式バリデーション
    const cidrRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/;
    if (allowedIp && !allowedIp.split(',').every((ip: string) => cidrRegex.test(ip.trim()))) {
      throw new Error(`ALLOWED_IPはCIDR形式で指定してください: ${allowedIp}`);
    }
    const sg = new ec2.SecurityGroup(this, 'DevEnvSG', {
      vpc,
      allowAllOutbound: true,
      description: 'Allow SSH',
    });
    // --- Tailscale前提: デフォルトで22番ポートはTailscale経由のみ許可 ---
    // allowedIp/SSH_PORT未指定時はTailscaleネットワークからのSSHのみ許可
    // Tailscaleのデフォルトサブネット（100.64.0.0/10）から22番ポートを許可
    if (!allowedIp && !(process.env.SSH_PORT || this.node.tryGetContext('SSH_PORT'))) {
      sg.addIngressRule(
        ec2.Peer.ipv4('100.64.0.0/10'),
        ec2.Port.tcp(22),
        'Allow SSH (Tailscale subnet, port 22)',
      );
    } else if (allowedIp) {
      const sshSource = ec2.Peer.ipv4(allowedIp);
      sg.addIngressRule(sshSource, ec2.Port.tcp(sshPort), `Allow SSH (port ${sshPort})`);
    } else if (process.env.SSH_PORT || this.node.tryGetContext('SSH_PORT')) {
      // ALLOWED_IP未指定かつSSH_PORTのみ指定時は全IPに対してそのポートを解放
      sg.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(sshPort),
        `Allow SSH (any, port ${sshPort})`,
      );
    }
    // allowedIp/SSH_PORT未指定時はTailscale以外のIngressルールを追加しない（全ポート閉鎖）

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

    // --- UserDataのハッシュ計算（バージョン管理用） ---
    const userDataPath = path.join(__dirname, '../templates/user-data.sh');
    const userData = fs.readFileSync(userDataPath, 'utf8');
    const userDataHash = crypto.createHash('sha256').update(userData).digest('hex').slice(0, 12);

    // --- リソース名の一意性確保用prefix/postfix ---
    const envName = process.env.ENV_NAME || this.node.tryGetContext('ENV_NAME') || 'dev';
    const stackName = cdk.Stack.of(this).stackName;
    const resourcePrefix = `${stackName}-${envName}`;

    // EC2 Instance
    const spotMaxPrice = this.node.tryGetContext('SPOT_MAX_PRICE') || process.env.SPOT_MAX_PRICE;
    // --- キーペア名の決定ロジックを修正 ---
    let keyPairName: string | undefined =
      process.env.KEY_PAIR_NAME || this.node.tryGetContext('KEY_PAIR_NAME');
    const keyPairDir = path.join(__dirname, '../keys');
    if (!keyPairName && fs.existsSync(keyPairDir)) {
      const pemFiles = fs.readdirSync(keyPairDir).filter((f) => f.endsWith('.pem'));
      if (pemFiles.length > 0) {
        keyPairName = path.parse(pemFiles[0]).name;
        // AWS側にキーペアが存在するかチェック（テスト用モック対応）
        import('aws-sdk')
          .then((AWS) => {
            const ec2Client = new AWS.EC2({ region: cdk.Stack.of(this).region });
            ec2Client
              .describeKeyPairs({ KeyNames: [keyPairName!] })
              .promise()
              .catch(() => {
                console.warn(
                  'AWS EC2にキーペアが存在しません。aws ec2 import-key-pair で登録してください。',
                );
              });
          })
          .catch(() => {
            // aws-sdkが無い場合は警告のみ
            console.warn('AWS EC2にキーペアが存在するか確認できません（aws-sdk未インストール）');
          });
      }
    }
    // S3権限の最小化例（バケット単位）
    // role.addToPolicy(new iam.PolicyStatement({
    //   actions: ['s3:*'],
    //   resources: ['arn:aws:s3:::your-bucket-name', 'arn:aws:s3:::your-bucket-name/*'],
    // }));

    const instance = new ec2.Instance(this, `${resourcePrefix}-Instance`, {
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
      ...(keyPairName && { keyName: keyPairName }),
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
      const uniqueBucketName = `${resourcePrefix}-${bucketName}`
        .toLowerCase()
        .replace(/[^a-z0-9.-]/g, '')
        .slice(0, 63);
      const bucket = new s3.Bucket(this, `${resourcePrefix}-ProjectBucket`, {
        bucketName: uniqueBucketName,
        removalPolicy: cdk.RemovalPolicy.DESTROY, // スタック削除時にバケットも削除,
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

    // EC2 Nameタグ付与（prefix+id+UserDataハッシュ）
    instance.instance.addPropertyOverride('Tags', [
      { Key: 'Name', Value: `${resourcePrefix}-${id}` },
      { Key: 'UserDataHash', Value: userDataHash },
    ]);

    // --- 追加: EC2接続情報をOutputsとして出力 ---
    const createOutput = (name: string, value: string, description: string) => {
      new cdk.CfnOutput(this, name, { value, description });
    };

    createOutput('EC2InstanceId', instance.instanceId, 'EC2 Instance ID');
    createOutput('EC2PublicIp', instance.instancePublicIp, 'EC2 Public IP');
    createOutput('EC2Region', cdk.Stack.of(this).region, 'EC2 Region');
    createOutput('EC2KeyName', instance.instance.keyName || '(not set)', 'EC2 SSH Key Name');
    // UserDataハッシュをOutputsにも出力
    createOutput('UserDataHash', userDataHash, 'UserData script SHA256 hash');

    // --- CloudWatch アラーム + Lambda でアイドル時自動停止 ---
    // 1. CloudWatch アラーム（CPU利用率5%未満が30分続いたら）
    const cpuAlarm = new cloudwatch.Alarm(this, 'CpuIdleAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/EC2',
        metricName: 'CPUUtilization',
        dimensionsMap: { InstanceId: instance.instanceId },
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 5,
      evaluationPeriods: 6, // 5分x6=30分
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'EC2が30分間アイドル状態なら自動停止',
    });

    // 2. Lambda（EC2停止用）
    const stopInstanceFn = new lambda.Function(this, 'AutoStopInstanceFn', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
import boto3
import os
def handler(event, context):
    ec2 = boto3.client('ec2')
    instance_id = os.environ['INSTANCE_ID']
    ec2.stop_instances(InstanceIds=[instance_id])
`),
      timeout: cdk.Duration.seconds(30),
      environment: {
        INSTANCE_ID: instance.instanceId,
      },
    });
    stopInstanceFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ec2:StopInstances'],
        // 本番運用ではResourceを特定インスタンスのみに制限することを推奨
        resources: [
          `arn:aws:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:instance/${instance.instanceId}`,
        ],
      }),
    );

    // 3. CloudWatchアラーム→EventBridge→Lambda連携
    const rule = new events.Rule(this, 'AutoStopRule', {
      eventPattern: {
        source: ['aws.cloudwatch'],
        detailType: ['CloudWatch Alarm State Change'],
        detail: {
          state: { value: ['ALARM'] },
          alarmName: [cpuAlarm.alarmName],
        },
      },
    });
    rule.addTarget(new targets.LambdaFunction(stopInstanceFn));

    // --- 追加: デプロイ後にtools/ec2_ssh_configを自動生成 ---
    try {
      const configPath = path.join(__dirname, '../tools/ec2_ssh_config');
      // キーペア名からpemファイル名を推測
      const keyFileName = keyPairName ? `../keys/${keyPairName}.pem` : '../keys/my-key.pem';
      // デフォルトユーザー名（Amazon Linux想定）
      const user = 'ec2-user';
      // AWS認証情報は環境変数から取得
      const accessKey = process.env.AWS_ACCESS_KEY_ID || '';
      const secretKey = process.env.AWS_SECRET_ACCESS_KEY || '';
      const region = cdk.Stack.of(this).region;
      const config = `# EC2 SSH スクリプト用設定ファイル（CDKデプロイ時に自動生成）\nINSTANCE_ID="${instance.instanceId}"\nKEY_PATH="${keyFileName}"\nUSER="${user}"\nREGION="${region}"\nAWS_ACCESS_KEY_ID="${accessKey}"\nAWS_SECRET_ACCESS_KEY="${secretKey}"\nAWS_DEFAULT_REGION="${region}"\n`;
      fs.writeFileSync(configPath, config, { encoding: 'utf-8' });

      console.log(`tools/ec2_ssh_config を自動生成しました: ${configPath}`);

      // --- 追加: EC2接続情報CSVを自動生成 ---
      const csvPath = path.join(__dirname, '../ec2-connection-info.csv');
      // パブリックIPはOutputsでしか取得できないため、CloudFormation出力値を利用する想定
      // ここではCDKデプロイ時点で取得できる値で出力（PublicIpはデプロイ直後は未割当の可能性あり）
      const publicIp = instance.instancePublicIp || '';
      const keyName = keyPairName || '';
      const sshCmd = `ssh -i keys/${keyName}.pem ${user}@${publicIp}`;
      const createdAt = new Date().toISOString();
      const csvHeader = 'InstanceId,PublicIp,User,KeyName,Region,SSHCommand,CreatedAt\n';
      const csvRow = `${instance.instanceId},${publicIp},${user},${keyName},${region},"${sshCmd}",${createdAt}\n`;
      fs.writeFileSync(csvPath, csvHeader + csvRow, { encoding: 'utf-8' });
      console.log(`ec2-connection-info.csv を自動生成しました: ${csvPath}`);
    } catch (e) {
      console.error('tools/ec2_ssh_config/ec2-connection-info.csv の自動生成に失敗:', e);
    }
  }
}

// Node.jsグローバル変数をESLintに認識させるための設定が必要

// Removed redefinition of Node.js globals. Ensure ESLint is configured properly for these globals.
