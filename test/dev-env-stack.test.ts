// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
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

describe('DevEnvStack', () => {
  beforeEach(() => {
    delete process.env.ALLOWED_IP;
    delete process.env.SSH_PORT;
  });

  test('Stack synthesizes successfully', () => {
    const app = new App();
    const stack = new DevEnvStack(app, 'TestStack');
    const template = Template.fromStack(stack);
    expect(template).toBeDefined();
  });

  test('EC2インスタンスが作成されていること', () => {
    const app = new App();
    const stack = new DevEnvStack(app, 'TestStack');
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::EC2::Instance', 1);
  });

  test('ALLOWED_IP/SSH_PORTの組み合わせによるセキュリティグループ挙動', () => {
    // 1. ALLOWED_IP/SSH_PORT両方指定 → 指定IP・指定ポートのみ許可
    process.env.ALLOWED_IP = '203.0.113.1/32';
    process.env.SSH_PORT = '2222';
    let app = new App();
    let stack = new DevEnvStack(app, 'TestStack1');
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
    app = new App();
    stack = new DevEnvStack(app, 'TestStack2');
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
    app = new App();
    stack = new DevEnvStack(app, 'TestStack3');
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
    const app = new App();
    const stack = new DevEnvStack(app, 'TestStack');
    const template = Template.fromStack(stack);

    // Lambda
    const lambdas = template.findResources('AWS::Lambda::Function');
    expect(Object.keys(lambdas).length).toBe(1);
    const lambdaResource = Object.values(lambdas)[0] as unknown;
    if (!lambdaResource || typeof lambdaResource !== 'object')
      throw new Error('Lambdaリソースが不正');
    const lambdaProps = (lambdaResource as { Properties: Record<string, unknown> }).Properties;
    expect(lambdaProps.Handler).toBe('index.handler');
    expect(lambdaProps.Runtime).toMatch(/python/i);
    expect(
      (lambdaProps.Environment as { Variables: Record<string, unknown> }).Variables.INSTANCE_ID,
    ).toBeDefined();
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

  test('CloudFormationテンプレートの全リソースを出力（デバッグ用）', () => {
    const app = new App();
    const stack = new DevEnvStack(app, 'TestStack');
    const template = Template.fromStack(stack);
    if (process.env.DEBUG === 'true') {
      console.log(JSON.stringify(template.toJSON(), null, 2));
    }
  });

  test('keyNameが指定された場合にEC2インスタンスに反映される', () => {
    process.env.KEY_PAIR_NAME = 'my-key';
    const app = new App();
    const stack = new DevEnvStack(app, 'TestStackKeyPair');
    const template = Template.fromStack(stack);
    const resources = template.findResources('AWS::EC2::Instance');
    const instance = Object.values(resources)[0];
    expect(instance.Properties.KeyName).toBe('my-key');
    delete process.env.KEY_PAIR_NAME;
  });

  test('keyNameが未指定の場合はEC2インスタンスにKeyNameプロパティが含まれない（keys/に.pemが無い場合）', () => {
    // keys/ディレクトリを完全削除
    const keyDir = path.join(__dirname, '../keys');
    const tmpDir = path.join(__dirname, '../keys_tmp');
    if (fs.existsSync(keyDir)) {
      fs.rmdirSync(keyDir, { recursive: true });
    }
    const app = new App();
    const stack = new DevEnvStack(app, 'TestStackNoKey');
    const template = Template.fromStack(stack);
    const resources = template.findResources('AWS::EC2::Instance');
    const instance = Object.values(resources)[0];
    expect(instance.Properties.KeyName).toBeUndefined();
    // keys/ディレクトリを元に戻す
    if (!fs.existsSync(keyDir)) fs.mkdirSync(keyDir);
  });

  test.skip('CDKデプロイ時にSSH接続情報CSVとec2_ssh_configが正しく出力される', () => {
    // 現状のCDK実装では不要なためスキップ
  });

  test('CDKデプロイ時に.envが自動配置され、Tailscale等のセットアップが実行される', () => {
    const app = new App();
    const stack = new DevEnvStack(app, 'TestStackEnvUserData');
    const template = Template.fromStack(stack);
    const resources = template.findResources('AWS::EC2::Instance');
    const instance = Object.values(resources)[0];
    expect(instance.Properties.UserData).toBeDefined();
    const userDataBase64 = instance.Properties.UserData['Fn::Base64'];
    expect(userDataBase64).toMatch(/cat <<'EOF' > \/home\/ec2-user\/.env/);
    expect(userDataBase64).toMatch(/chown ec2-user:ec2-user \/home\/ec2-user\/.env/);
    expect(userDataBase64).toMatch(/chmod 600 \/home\/ec2-user\/.env/);
    expect(userDataBase64).toMatch(/tailscale/);
  });

  test('gen_ec2_ssh_config.jsでec2_ssh_configが正しく生成される', async () => {
    // 事前にec2-connection-info.csvを用意
    const csvPath = path.join(__dirname, '../ec2-connection-info.csv');
    const configPath = path.join(__dirname, '../tools/ec2_ssh_config');
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    fs.writeFileSync(
      csvPath,
      'InstanceId,PublicIp,User,KeyName,Region,SSHCommand,CreatedAt\ni-abcde,203.0.113.10,ec2-user,my-key,ap-northeast-1,"ssh -i keys/my-key.pem ec2-user@203.0.113.10",2025-06-01T00:00:00Z\n',
      { encoding: 'utf-8' },
    );
    process.env.AWS_ACCESS_KEY_ID = 'dummy-access';
    process.env.AWS_SECRET_ACCESS_KEY = 'dummy-secret';
    // スクリプト実行
    let exitError = undefined;
    try {
      require('../tools/gen_ec2_ssh_config');
    } catch (e) {
      exitError = e;
    }
    // ec2_ssh_config生成を最大1秒待つ
    let config = '';
    for (let i = 0; i < 10; i++) {
      if (fs.existsSync(configPath)) {
        config = fs.readFileSync(configPath, 'utf-8');
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(config).toContain('INSTANCE_ID="i-abcde"');
    expect(config).toContain('KEY_PATH="../keys/my-key.pem"');
    expect(config).toContain('AWS_ACCESS_KEY_ID="dummy-access"');
    expect(config).toContain('AWS_SECRET_ACCESS_KEY="dummy-secret"');
    expect(config).toContain('REGION="ap-northeast-1"');
    expect(config).toContain('PUBLIC_IP="203.0.113.10"');
    // 後片付け
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    // process.exitによる例外は無視
    if (exitError && !String(exitError).includes('process.exit')) throw exitError;
  });
});
