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

export interface DevEnvStackProps extends cdk.StackProps {
  envBucket: s3.IBucket;
  resourcePrefix: string;
}

export class DevEnvStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DevEnvStackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'DevEnvVpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: true, // 追加: パブリックサブネットで必ずパブリックIPを割り当て
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
      ],
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
    const ami = ec2.MachineImage.latestAmazonLinux2({
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

    // S3バケット名の決定
    const bucketName = props.envBucket.bucketName;
    // envObjectKeyを必ず小文字で統一
    const envObjectKey = `${props.resourcePrefix}`.toLowerCase() + '/.env';
    if (process.env.NODE_ENV !== 'production') {
      console.log('envObjectKey:', envObjectKey); // デバッグ用
    }

    // EC2ロールにバケットアクセス権限を付与
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [props.envBucket.arnForObjects('*')],
      }),
    );

    // UserDataでS3から.envをダウンロード
    const region = cdk.Stack.of(this).region;
    // 1パート目: S3から.env取得＋ログリダイレクト
    const envSetupScript = `#!/bin/bash\nexec > /var/log/env_setup_script.log 2>&1\nset -e\nBUCKET="${bucketName}"\nKEY="${envObjectKey}"\nREGION="${region}"\necho "Downloading .env from S3: s3://$BUCKET/$KEY"\nfor i in {1..10}; do\n  if aws s3 cp s3://$BUCKET/$KEY /home/ec2-user/.env --region $REGION; then\n    chown ec2-user:ec2-user /home/ec2-user/.env\n    chmod 600 /home/ec2-user/.env\n    echo ".env downloaded and permissions set."\n    break\n  else\n    echo "Attempt $i: .env download failed. Retrying in 2s..."\n    sleep 2\n  fi\ndone\nif [ ! -f /home/ec2-user/.env ]; then\n  echo ".env download failed after retries. Check S3 permissions, bucket/key, and region."\n  exit 1\nfi\nls -l /home/ec2-user/.env || true\nhead -n 5 /home/ec2-user/.env || true\necho "[env-setup] 1st part finished: $(date)" | tee -a /var/log/env_setup_script.log\n`;

    // 2パート目: 本来のuser-data.sh（必ず#!/bin/bashを先頭に残し、exec > ...は除去）
    const originalUserDataPath = path.join(__dirname, '../templates/user-data.sh');
    let baseUserData = fs.readFileSync(originalUserDataPath, 'utf8');
    // shebang必須
    if (!baseUserData.startsWith('#!/bin/bash')) {
      baseUserData = '#!/bin/bash\n' + baseUserData;
    }
    // 2パート目の先頭にデバッグ用echoを追加
    baseUserData = baseUserData.replace(
      '#!/bin/bash',
      '#!/bin/bash\necho "[user-data.sh] 2nd part started: $(date)" | tee -a /var/log/env_setup_script.log',
    );
    // 2パート目ではexec > ...等のリダイレクト行を除去
    baseUserData = baseUserData
      .split('\n')
      .filter((line) => !line.match(/^exec\s*>/))
      .join('\n');

    // --- SSM/lessページャ回避TipsをREADMEに明記することを推奨 ---

    const multipartUserData = new ec2.MultipartUserData();
    multipartUserData.addUserDataPart(
      ec2.UserData.custom(envSetupScript),
      ec2.MultipartBody.SHELL_SCRIPT,
      false,
    );
    multipartUserData.addUserDataPart(
      ec2.UserData.custom(baseUserData),
      ec2.MultipartBody.SHELL_SCRIPT,
      false,
    );

    // spotMaxPrice, keyPairNameの定義をprops/既存ロジックから復元
    const spotMaxPrice = this.node.tryGetContext('SPOT_MAX_PRICE') || process.env.SPOT_MAX_PRICE;
    let keyPairName: string | undefined =
      process.env.KEY_PAIR_NAME || this.node.tryGetContext('KEY_PAIR_NAME');
    const keyPairDir = path.join(__dirname, '../keys');
    if (!keyPairName && fs.existsSync(keyPairDir)) {
      const pemFiles = fs.readdirSync(keyPairDir).filter((f) => f.endsWith('.pem'));
      if (pemFiles.length > 0) {
        keyPairName = path.parse(pemFiles[0]).name;
      }
    }

    const instance = new ec2.Instance(this, `${props.resourcePrefix}-Instance`, {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, // パブリックサブネットを明示
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.XLARGE),
      machineImage: ami,
      securityGroup: sg,
      role,
      blockDevices: [ebs],
      userData: multipartUserData,
      ...(spotMaxPrice && { spotPrice: spotMaxPrice }),
      ...(keyPairName && {
        keyPair: ec2.KeyPair.fromKeyPairName(this, 'ImportedKeyPair', keyPairName),
      }),
      associatePublicIpAddress: true, // パブリックIPを必ず割り当て
    });

    // --- デプロイ前に.envをS3へアップロード（自動化） ---
    // ※CDKからの自動アップロードは廃止。必ず事前にS3へアップロードしてください。
    // 例: aws s3 cp .env s3://" + bucketName + "/" + envObjectKey
    // READMEやnpm scriptで手順を明記することを推奨

    // CloudWatch Logs等を追加する場合もremovalPolicy: DESTROYを必ず指定してください

    // EC2 Nameタグ付与（prefix+id+UserDataハッシュ）
    instance.instance.addPropertyOverride('Tags', [
      { Key: 'Name', Value: `${props.resourcePrefix}-${id}` },
      { Key: 'UserDataHash', Value: userDataHash },
    ]);

    // --- 追加: EC2接続情報をOutputsとして出力 ---
    const createOutput = (name: string, value: string, description: string) => {
      new cdk.CfnOutput(this, name, { value, description });
    };

    createOutput('EC2InstanceId', instance.instanceId, 'EC2 Instance ID');
    createOutput('EC2Region', cdk.Stack.of(this).region, 'EC2 Region');
    createOutput('EC2KeyName', instance.instance.keyName || '(not set)', 'EC2 SSH Key Name');
    createOutput('UserDataHash', userDataHash, 'UserData script SHA256 hash');
    // パブリックIPはOutputsで出力しない（describe-instances等で取得する運用に統一）
    // --- CloudFormation テンプレートのOutputsにEC2PublicIpが混入しないよう明示的に削除 ---
    if ((this as any).templateOptions && (this as any).templateOptions.outputs) {
      delete (this as any).templateOptions.outputs.EC2PublicIp;
    }

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
  }
}

// Node.jsグローバル変数をESLintに認識させるための設定が必要

// Removed redefinition of Node.js globals. Ensure ESLint is configured properly for these globals.

// bin/dev-env.ts からenvBucket, resourcePrefixをpropsで受け取る前提
// 例: new DevEnvStack(app, 'DevEnvStack', { envBucket: s3Stack.envBucket, resourcePrefix })
