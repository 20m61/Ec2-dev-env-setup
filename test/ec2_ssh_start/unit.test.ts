import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import os from 'os';
import * as ec2ssh from '../../tools/ec2_ssh_start';

jest.mock('child_process');
const mockSpawnSync = spawnSync as unknown as jest.Mock<
  { status: number; stdout: string; stderr: string },
  string[]
>;

describe('ec2_ssh_start.ts function unit tests', () => {
  const configPath = path.join(__dirname, '../../tools/ec2_ssh_config');
  const dummyConfig = {
    INSTANCE_ID: 'i-xxx',
    KEY_PATH: '../keys/my-key.pem',
    USER: 'ec2-user',
    REGION: 'ap-northeast-1',
    AWS_ACCESS_KEY_ID: 'dummy',
    AWS_SECRET_ACCESS_KEY: 'dummy',
    AWS_DEFAULT_REGION: 'ap-northeast-1',
  };

  let tempKeyPath: string;
  beforeEach(() => {
    mockSpawnSync.mockReset();
    // テスト用一時鍵ファイルを作成
    tempKeyPath = path.join(os.tmpdir(), `test-key-${Date.now()}`);
    fs.writeFileSync(
      configPath,
      Object.entries({ ...dummyConfig, KEY_PATH: tempKeyPath })
        .map(([k, v]) => `${k}="${v}"`)
        .join('\n') + '\n',
    );
  });
  afterEach(() => {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    if (tempKeyPath && fs.existsSync(tempKeyPath)) fs.unlinkSync(tempKeyPath);
  });

  test('loadConfig: 設定ファイルを正しく読み込む', () => {
    const cfg = ec2ssh.loadConfig(configPath);
    expect(cfg.INSTANCE_ID).toBe('i-xxx');
    expect(cfg.USER).toBe('ec2-user');
  });

  test('setupAwsCredentials: 認証情報がセットされる', () => {
    ec2ssh.setupAwsCredentials(dummyConfig);
    expect(process.env.AWS_ACCESS_KEY_ID).toBe('dummy');
    expect(process.env.AWS_SECRET_ACCESS_KEY).toBe('dummy');
    expect(process.env.AWS_DEFAULT_REGION).toBe('ap-northeast-1');
  });

  test('setupAwsCredentials: 認証情報が無い場合は例外', () => {
    expect(() =>
      ec2ssh.setupAwsCredentials({ ...dummyConfig, AWS_ACCESS_KEY_ID: undefined }),
    ).toThrow();
    expect(() =>
      ec2ssh.setupAwsCredentials({ ...dummyConfig, AWS_SECRET_ACCESS_KEY: undefined }),
    ).toThrow();
  });

  test('startInstance: 正常に呼び出せる', () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
    expect(() => ec2ssh.startInstance(dummyConfig)).not.toThrow();
  });

  test('startInstance: 失敗時は例外', () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'error' });
    expect(() => ec2ssh.startInstance(dummyConfig)).toThrow(/EC2インスタンス起動失敗/);
  });

  test('waitForInstanceRunning: runningなら即return', () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'running', stderr: '' });
    expect(() => ec2ssh.waitForInstanceRunning(dummyConfig)).not.toThrow();
  });

  test('waitForInstanceRunning: running以外でTEST_MODE=1なら即return', () => {
    process.env.TEST_MODE = '1';
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'pending', stderr: '' });
    expect(() => ec2ssh.waitForInstanceRunning(dummyConfig)).not.toThrow();
    delete process.env.TEST_MODE;
  });

  test('waitForInstanceRunning: running以外でTEST_MODE未設定時はAtomics.waitが呼ばれる', () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: 'pending', stderr: '' })
      .mockReturnValueOnce({ status: 0, stdout: 'running', stderr: '' });
    const atomicsWaitSpy = jest
      .spyOn(Atomics, 'wait')
      .mockReturnValue('ok' as ReturnType<typeof Atomics.wait>);
    expect(() => ec2ssh.waitForInstanceRunning(dummyConfig, 1)).not.toThrow();
    expect(atomicsWaitSpy).toHaveBeenCalled();
    atomicsWaitSpy.mockRestore();
  });

  test('getInstancePublicIp: IP取得成功', () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '203.0.113.10', stderr: '' });
    expect(ec2ssh.getInstancePublicIp(dummyConfig)).toBe('203.0.113.10');
  });

  test('getInstancePublicIp: Noneなら例外', () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'None', stderr: '' });
    expect(() => ec2ssh.getInstancePublicIp(dummyConfig)).toThrow(/パブリックIPが取得できません/);
  });

  test('sshToInstance: SSH成功', () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
    fs.writeFileSync(tempKeyPath, 'dummy');
    expect(() =>
      ec2ssh.sshToInstance({ ...dummyConfig, KEY_PATH: tempKeyPath }, '203.0.113.10'),
    ).not.toThrow();
  });

  test('sshToInstance: SSH失敗で例外', () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'error' });
    fs.writeFileSync(tempKeyPath, 'dummy');
    expect(() =>
      ec2ssh.sshToInstance({ ...dummyConfig, KEY_PATH: tempKeyPath }, '203.0.113.10'),
    ).toThrow(/SSH接続失敗/);
  });

  test('設定ファイルが存在しない場合はエラーとなる（.env/secret未設定相当）', () => {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    expect(() => ec2ssh.loadConfig(configPath)).toThrow(/見つかりません/);
  });

  // aws/sshコマンドのモック化例（jest.spyOnやmockImplementationで）
  // ここではコマンド呼び出し部分のテスト例を追加できます
});
