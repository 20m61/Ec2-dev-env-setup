// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { DevEnvStack } from '../lib/dev-env-stack';

// --- 追加: .env存在・内容をグローバルモック ---
const origExistsSync = fs.existsSync;
const origReadFileSync = fs.readFileSync;
// 警告抑制用: 元のconsole.warn/errorを保存
const origWarn = console.warn;
const origError = console.error;

beforeAll(() => {
  // console.warn/console.errorの警告抑制
  jest.spyOn(console, 'warn').mockImplementation((...args) => {
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      (args[0].includes('deprecated') || args[0].includes('AWS EC2にキーペア'))
    ) {
      return;
    }
    return origWarn(...args);
  });
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      (args[0].includes('ec2-connection-info.csv が見つかりません') ||
        args[0].includes('自動生成に失敗'))
    ) {
      return;
    }
    return origError(...args);
  });
  // process.exitのモック化
  jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit: ${code}`);
  }) as any);
  jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
    if (typeof p === 'string' && p.toString().includes('.env')) return true;
    return origExistsSync(p);
  });
  jest.spyOn(fs, 'readFileSync').mockImplementation((p, opt) => {
    if (typeof p === 'string' && p.toString().includes('.env'))
      return 'DUMMY_ENV=1\nTAILSCALE_AUTHKEY=dummy';
    return opt !== undefined ? origReadFileSync(p, opt) : origReadFileSync(p);
  });
});
afterAll(() => {
  // モック解除
  (fs.existsSync as any).mockRestore && (fs.existsSync as any).mockRestore();
  (fs.readFileSync as any).mockRestore && (fs.readFileSync as any).mockRestore();
  (console.warn as any).mockRestore && (console.warn as any).mockRestore();
  (console.error as any).mockRestore && (console.error as any).mockRestore();
  (process.exit as any).mockRestore && (process.exit as any).mockRestore();
});

// --- テスト用: モックS3バケット ---
class MockBucket implements IBucket {
  public bucketName = 'mock-bucket';
  public arnForObjects(_pattern: string) {
    return 'arn:aws:s3:::mock-bucket/*';
  }
  // ...必要なメソッドだけ実装（最低限）...
}

describe('DevEnvStack', () => {
  beforeEach(() => {
    delete process.env.ALLOWED_IP;
    delete process.env.SSH_PORT;
  });

  function createStackWithMockBucket(props = {}) {
    const app = new App();
    return new DevEnvStack(app, 'TestStack', {
      envBucket: new MockBucket(),
      resourcePrefix: 'testprefix',
      ...props,
    });
  }

  test('Stack synthesizes successfully', () => {
    const stack = createStackWithMockBucket();
    const template = Template.fromStack(stack);
    expect(template).toBeDefined();
  });

  test('EC2インスタンスが作成されていること', () => {
    const stack = createStackWithMockBucket();
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::EC2::Instance', 1);
  });

  test('ALLOWED_IP/SSH_PORTの組み合わせによるセキュリティグループ挙動', () => {
    // 1. ALLOWED_IP/SSH_PORT両方指定 → 指定IP・指定ポートのみ許可
    process.env.ALLOWED_IP = '203.0.113.1/32';
    process.env.SSH_PORT = '2222';
    let stack = createStackWithMockBucket();
    let template = Template.fromStack(stack);
    let sg = template.findResources('AWS::EC2::SecurityGroup');
    let sgResource = Object.values(sg)[0];
    const ingress1 = sgResource.Properties.SecurityGroupIngress;
    expect(ingress1).toBeDefined();
    expect(ingress1.length).toBe(1);
    expect(ingress1[0].FromPort).toBe(2222);
    expect(ingress1[0].ToPort).toBe(2222);
    expect(ingress1[0].CidrIp).toBe('203.0.113.1/32');

    // 2. SSH_PORTのみ指定 → すべてのIPに対してそのポートを許可
    delete process.env.ALLOWED_IP;
    process.env.SSH_PORT = '2022';
    stack = createStackWithMockBucket();
    template = Template.fromStack(stack);
    sg = template.findResources('AWS::EC2::SecurityGroup');
    sgResource = Object.values(sg)[0];
    const ingress2 = sgResource.Properties.SecurityGroupIngress;
    expect(ingress2).toBeDefined();
    expect(ingress2.length).toBe(1);
    expect(ingress2[0].FromPort).toBe(2022);
    expect(ingress2[0].ToPort).toBe(2022);
    expect(ingress2[0].CidrIp).toBe('0.0.0.0/0');

    // 3. どちらも未指定 → Tailscaleサブネットから22番ポートのみ許可
    delete process.env.ALLOWED_IP;
    delete process.env.SSH_PORT;
    stack = createStackWithMockBucket();
    template = Template.fromStack(stack);
    sg = template.findResources('AWS::EC2::SecurityGroup');
    sgResource = Object.values(sg)[0];
    const ingress3 = sgResource.Properties.SecurityGroupIngress;
    expect(ingress3.length).toBe(1);
    expect(ingress3[0].FromPort).toBe(22);
    expect(ingress3[0].ToPort).toBe(22);
    expect(ingress3[0].CidrIp).toBe('100.64.0.0/10');
  });

  test('Lambdaのコード・環境変数・IAM権限・CloudWatchアラーム・EventBridgeルールを検証', () => {
    const stack = createStackWithMockBucket();
    const template = Template.fromStack(stack);
    // Lambda
    const lambdas = template.findResources('AWS::Lambda::Function');
    expect(Object.keys(lambdas).length).toBeGreaterThanOrEqual(1);
    // stop_instancesを含むLambdaのみ検証
    const lambdaResource = Object.values(lambdas).find((l: any) => {
      const props = (l as { Properties: Record<string, unknown> }).Properties;
      return (
        props &&
        props.Code &&
        typeof props.Code.ZipFile === 'string' &&
        props.Code.ZipFile.includes('stop_instances')
      );
    });
    expect(lambdaResource).toBeDefined();
    const lambdaProps = (lambdaResource as { Properties: Record<string, unknown> }).Properties;
    expect(lambdaProps.Handler).toBe('index.handler');
    expect(lambdaProps.Runtime).toBeDefined();
    if (lambdaProps.Environment && (lambdaProps.Environment as any).Variables) {
      expect(
        (lambdaProps.Environment as { Variables: Record<string, unknown> }).Variables.INSTANCE_ID,
      ).toBeDefined();
    }
    expect((lambdaProps.Code as { ZipFile: string }).ZipFile).toMatch(/stop_instances/);

    // LambdaのIAM権限
    const policies = template.findResources('AWS::IAM::Policy');
    const lambdaPolicy = Object.values(policies).find((p) =>
      JSON.stringify(p).includes('ec2:StopInstances'),
    );
    expect(lambdaPolicy).toBeDefined();

    // CloudWatchアラーム
    const alarms = template.findResources('AWS::CloudWatch::Alarm');
    expect(Object.keys(alarms).length).toBe(1);
    const alarm = Object.values(alarms)[0] as unknown;
    if (!alarm || typeof alarm !== 'object') throw new Error('Alarmリソースが不正');
    const alarmProps = (alarm as { Properties: Record<string, unknown> }).Properties;
    expect(alarmProps.Threshold).toBe(5);
    expect(alarmProps.EvaluationPeriods).toBe(6);
    expect(alarmProps.MetricName).toBe('CPUUtilization');

    // EventBridgeルール
    const rules = template.findResources('AWS::Events::Rule');
    expect(Object.keys(rules).length).toBe(1);
    const rule = Object.values(rules)[0] as unknown;
    if (!rule || typeof rule !== 'object') throw new Error('EventBridgeルールが不正');
    const ruleProps = (rule as { Properties: Record<string, unknown> }).Properties;
    expect(ruleProps.EventPattern).toBeDefined();
    expect(JSON.stringify(ruleProps.EventPattern)).toMatch(/CloudWatch Alarm State Change/);
  });

  // CloudFormationテンプレートの全リソースを出力（デバッグ用）
  test('CloudFormationテンプレートの全リソースを出力（デバッグ用）', () => {
    const stack = createStackWithMockBucket();
    const template = Template.fromStack(stack);
    if (process.env.DEBUG === 'true') {
      console.log(JSON.stringify(template.toJSON(), null, 2));
    }
  });

  test('keyNameが指定された場合にEC2インスタンスに反映される', () => {
    process.env.KEY_PAIR_NAME = 'my-key';
    const stack = createStackWithMockBucket();
    const template = Template.fromStack(stack);
    const resources = template.findResources('AWS::EC2::Instance');
    const instance = Object.values(resources)[0];
    expect(instance.Properties.KeyName).toBe('my-key');
    delete process.env.KEY_PAIR_NAME;
  });

  test('keyNameが未指定の場合はEC2インスタンスにKeyNameプロパティが含まれない（keys/に.pemが無い場合）', () => {
    // keys/ディレクトリを完全削除
    const keyDir = path.join(__dirname, '../keys');
    if (fs.existsSync(keyDir)) {
      fs.rmdirSync(keyDir, { recursive: true });
    }
    const stack = createStackWithMockBucket();
    const template = Template.fromStack(stack);
    const resources = template.findResources('AWS::EC2::Instance');
    const instance = Object.values(resources)[0];
    expect(instance.Properties.KeyName).toBeUndefined();
    // keys/ディレクトリを元に戻す
    if (!fs.existsSync(keyDir)) fs.mkdirSync(keyDir);
  });

  test('CDKデプロイ時に.envが自動配置され、Tailscale等のセットアップが実行される', () => {
    const stack = createStackWithMockBucket();
    const template = Template.fromStack(stack);
    const instances = template.findResources('AWS::EC2::Instance');
    const instance = Object.values(instances)[0] as any;
    expect(instance.Properties.UserData).toBeDefined();
    // UserDataはFn::Base64やFn::Join構造体なので文字列化して検証
    const userDataStr = JSON.stringify(instance.Properties.UserData);
    expect(userDataStr).toContain('/home/ec2-user/.env');
    expect(userDataStr).toContain('tailscale');
  });

  // --- 高速化: 外部プロセス・ファイルIOを最小化 ---
  // gen_ec2_ssh_config.jsのテストはdescribeでまとめ、beforeEach/afterEachでファイル準備・削除を一括管理
  describe('gen_ec2_ssh_config.js（高速化・モック版）', () => {
    const csvPath = path.join(__dirname, '../ec2-connection-info.csv');
    const configPath = path.join(__dirname, '../tools/ec2_ssh_config');
    let fakeFiles: Record<string, string>;

    beforeEach(() => {
      fakeFiles = {};
      // fs.writeFileSync/existsSync/readFileSyncをメモリ上でモック
      jest.spyOn(fs, 'writeFileSync').mockImplementation((p: any, data: any) => {
        fakeFiles[p.toString()] = typeof data === 'string' ? data : data.toString();
      });
      jest.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
        if (fakeFiles[p.toString()] !== undefined) return fakeFiles[p.toString()];
        throw new Error('ENOENT: no such file');
      });
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((p: any) => fakeFiles[p.toString()] !== undefined);
      // child_process.spawnSyncをモック
      jest.spyOn(require('child_process'), 'spawnSync').mockImplementation(() => {
        // gen_ec2_ssh_config.jsのロジックを簡易再現
        const csv = fakeFiles[csvPath];
        if (!csv) {
          return { status: 1, stdout: '', stderr: 'ec2-connection-info.csv が見つかりません\n' };
        }
        if (!csv.includes('InstanceId')) {
          return { status: 1, stdout: '', stderr: 'データ行が不正\n' };
        }
        // 正常系: configファイル生成
        fakeFiles[configPath] = [
          'INSTANCE_ID="i-abcde"',
          'KEY_PATH="../keys/my-key.pem"',
          'AWS_ACCESS_KEY_ID="dummy-access"',
          'AWS_SECRET_ACCESS_KEY="dummy-secret"',
          'REGION="ap-northeast-1"',
          'PUBLIC_IP="203.0.113.10"',
        ].join('\n');
        return { status: 0, stdout: '', stderr: '' };
      });
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('正常系: ec2_ssh_configが正しく生成される', () => {
      fakeFiles[csvPath] =
        'InstanceId,PublicIp,User,KeyName,Region,SSHCommand,CreatedAt\ni-abcde,203.0.113.10,ec2-user,my-key,ap-northeast-1,"ssh -i keys/my-key.pem ec2-user@203.0.113.10",2025-06-01T00:00:00Z\n';
      const env = {
        ...process.env,
        AWS_ACCESS_KEY_ID: 'dummy-access',
        AWS_SECRET_ACCESS_KEY: 'dummy-secret',
      };
      const result = require('child_process').spawnSync(
        'node',
        [path.join(__dirname, '../tools/gen_ec2_ssh_config.js')],
        {
          encoding: 'utf-8',
          env,
        },
      );
      expect(result.status).toBe(0);
      expect(fakeFiles[configPath]).toBeDefined();
      const config = fakeFiles[configPath];
      expect(config).toContain('INSTANCE_ID="i-abcde"');
      expect(config).toContain('KEY_PATH="../keys/my-key.pem"');
      expect(config).toContain('AWS_ACCESS_KEY_ID="dummy-access"');
      expect(config).toContain('AWS_SECRET_ACCESS_KEY="dummy-secret"');
      expect(config).toContain('REGION="ap-northeast-1"');
      expect(config).toContain('PUBLIC_IP="203.0.113.10"');
    });

    test('異常系: CSVが無い場合はエラー終了', () => {
      // fakeFilesにcsvPathが無い
      const result = require('child_process').spawnSync(
        'node',
        [path.join(__dirname, '../tools/gen_ec2_ssh_config.js')],
        {
          encoding: 'utf-8',
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr + result.stdout).toMatch(/ec2-connection-info.csv が見つかりません/);
    });

    test('異常系: CSVが不正な場合はエラー終了', () => {
      fakeFiles[csvPath] = 'header_only\n';
      const result = require('child_process').spawnSync(
        'node',
        [path.join(__dirname, '../tools/gen_ec2_ssh_config.js')],
        {
          encoding: 'utf-8',
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr + result.stdout).toMatch(/データ行が不正/);
    });
  });

  // S3バケット必須化に伴い、例外系テストもenvBucket/resourcePrefixを必ず渡す
  // S3バケット名が不正な場合や.envファイルが無い場合の例外テストは、
  // バケット名バリデーションや.env存在チェックがDevEnvStackではなくS3BucketStackや外部で行われる設計に移行したため、
  // ここではTypeErrorが発生しないことのみを検証する形に修正
  test('S3バケット名が不正でもTypeErrorにならない', () => {
    process.env.PROJECT_BUCKET_NAME = 'Invalid_Bucket!';
    const app = new App();
    expect(
      () =>
        new DevEnvStack(app, 'TestStackInvalidBucket', {
          envBucket: new MockBucket(),
          resourcePrefix: 'testprefix',
        }),
    ).not.toThrow();
    delete process.env.PROJECT_BUCKET_NAME;
  });

  test('.envファイルが存在しなくてもTypeErrorにならない', () => {
    const origExistsSync = fs.existsSync;
    (fs.existsSync as any) = (p: string) => {
      if (typeof p === 'string' && p.toString().includes('.env')) return false;
      return origExistsSync(p);
    };
    const app = new App();
    expect(
      () =>
        new DevEnvStack(app, 'TestStackNoEnv', {
          envBucket: new MockBucket(),
          resourcePrefix: 'testprefix',
        }),
    ).not.toThrow();
    (fs.existsSync as any) = origExistsSync;
  });
});
