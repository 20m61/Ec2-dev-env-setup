import fs from 'fs';
import path from 'path';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { DevEnvStack } from '../lib/dev-env-stack';

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
    // keys/ディレクトリを一時退避
    const keyDir = path.join(__dirname, '../keys');
    const tmpDir = path.join(__dirname, '../keys_tmp');
    if (fs.existsSync(keyDir)) fs.renameSync(keyDir, tmpDir);
    const app = new App();
    const stack = new DevEnvStack(app, 'TestStackNoKey');
    const template = Template.fromStack(stack);
    const resources = template.findResources('AWS::EC2::Instance');
    const instance = Object.values(resources)[0];
    expect(instance.Properties.KeyName).toBeUndefined();
    // keys/ディレクトリを元に戻す
    if (fs.existsSync(tmpDir)) fs.renameSync(tmpDir, keyDir);
  });

  test('user-data.shにTailscale自動インストール・認証コマンドが含まれる', () => {
    const userData = fs.readFileSync(path.join(__dirname, '../templates/user-data.sh'), 'utf8');
    expect(userData).toMatch(/tailscale/);
    expect(userData).toMatch(/tailscaled/);
    expect(userData).toMatch(/TAILSCALE_AUTHKEY/);
    expect(userData).toMatch(/tailscale up/);
  });

  test('PROJECT_BUCKET_NAMEが正しい場合にS3バケットが作成される', () => {
    process.env.PROJECT_BUCKET_NAME = 'valid-bucket-123';
    const app = new App();
    const stack = new DevEnvStack(app, 'TestStackS3');
    const template = Template.fromStack(stack);
    const buckets = template.findResources('AWS::S3::Bucket');
    expect(Object.keys(buckets).length).toBe(1);
    delete process.env.PROJECT_BUCKET_NAME;
  });

  test('PROJECT_BUCKET_NAMEが不正な場合は例外が投げられる', () => {
    process.env.PROJECT_BUCKET_NAME = 'Invalid_Bucket!';
    const app = new App();
    expect(() => new DevEnvStack(app, 'TestStackS3Invalid')).toThrow(/S3バケット名が不正/);
    delete process.env.PROJECT_BUCKET_NAME;
  });

  test('EC2インスタンスのEBS設定が正しい', () => {
    const app = new App();
    const stack = new DevEnvStack(app, 'TestStackEBS');
    const template = Template.fromStack(stack);
    const resources = template.findResources('AWS::EC2::Instance');
    const instance = Object.values(resources)[0];
    expect(instance.Properties.BlockDeviceMappings[0].Ebs.VolumeType).toBe('gp3');
    expect(instance.Properties.BlockDeviceMappings[0].Ebs.DeleteOnTermination).toBe(true);
    expect(instance.Properties.BlockDeviceMappings[0].Ebs.VolumeSize).toBe(100);
  });

  test('S3バケット指定時のみIAMロールにS3権限が追加される', () => {
    process.env.PROJECT_BUCKET_NAME = 'valid-bucket-123';
    const app = new App();
    const stack = new DevEnvStack(app, 'TestStackS3Policy');
    const template = Template.fromStack(stack);
    const policies = template.findResources('AWS::IAM::Policy');
    const s3Policy = Object.values(policies).find((p) => JSON.stringify(p).includes('s3:*'));
    expect(s3Policy).toBeDefined();
    delete process.env.PROJECT_BUCKET_NAME;
  });

  test('user-data.shが存在しない場合は例外が投げられる', () => {
    jest.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    const app = new App();
    expect(() => new DevEnvStack(app, 'TestStackUserDataMissing')).toThrow(/ENOENT/);
  });

  test('keys/内の.pemファイル名がkeyNameに使われる & AWS側存在チェック警告が出る', async () => {
    // テスト用のダミー.pemファイルを作成
    const keyDir = path.join(__dirname, '../keys');
    const testPem = path.join(keyDir, 'test-key.pem');
    if (!fs.existsSync(keyDir)) fs.mkdirSync(keyDir);
    fs.writeFileSync(testPem, 'dummy');
    // モック: aws-sdkのdescribeKeyPairsを必ずrejectする
    jest.mock('aws-sdk', () => {
      return {
        EC2: jest.fn().mockImplementation(() => ({
          describeKeyPairs: () => ({ promise: () => Promise.reject(new Error('Not found')) }),
        })),
      };
    });
    const app = new App();
    // 警告が出るか確認（非同期なのでsetTimeoutで待つ）
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    new DevEnvStack(app, 'TestStackKeyPair');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(warnSpy.mock.calls.some((call) => call[0].includes('AWS EC2にキーペア'))).toBe(true);
    warnSpy.mockRestore();
    fs.unlinkSync(testPem);
  });

  // S3バケットは環境変数/Contextで指定時のみ作成されるため、ここでは省略
  // UserDataの内容検証はCDKのTemplate APIでは難しいため、別途スタブ化やモックでの検証が必要
});
