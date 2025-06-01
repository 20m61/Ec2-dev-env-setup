import fs from 'fs';
import path from 'path';
import child_process from 'child_process';

describe('tools/ec2_ssh_start.sh', () => {
  const configPath = path.join(__dirname, '../tools/ec2_ssh_config');
  const scriptPath = path.join(__dirname, '../tools/ec2_ssh_start.sh');
  const backupPath = configPath + '.bak';
  const mockDir = path.join(__dirname, '../tools/__mocks__');
  const origPath = process.env.PATH;

  beforeAll(() => {
    // __mocks__ ディレクトリ作成
    if (!fs.existsSync(mockDir)) fs.mkdirSync(mockDir);
    // aws モック
    fs.writeFileSync(
      path.join(mockDir, 'aws'),
      `#!/bin/bash\n\n# 引数をすべてログに出力（デバッグ用）\necho \"[MOCK AWS] $@\" >&2\nif [[ $1 == 'ec2' && $2 == 'describe-instances' ]]; then\n  if [[ $@ == *"State.Name"* ]]; then\n    echo running\n  elif [[ $@ == *"PublicIpAddress"* ]]; then\n    echo 203.0.113.10\n  fi\n  exit 0\nelif [[ $1 == 'ec2' && $2 == 'start-instances' ]]; then\n  exit 0\nfi\nexit 0\n`,
    );
    fs.chmodSync(path.join(mockDir, 'aws'), 0o755);
    // ssh モック
    fs.writeFileSync(path.join(mockDir, 'ssh'), '#!/bin/bash\nexit 0\n');
    fs.chmodSync(path.join(mockDir, 'ssh'), 0o755);
    // sleep モック
    fs.writeFileSync(path.join(mockDir, 'sleep'), '#!/bin/bash\nexit 0\n');
    fs.chmodSync(path.join(mockDir, 'sleep'), 0o755);
    // aws-configure モック（aws configure呼び出し時にハングしないように）
    fs.writeFileSync(
      path.join(mockDir, 'aws-configure'),
      '#!/bin/bash\necho "[MOCK aws configure]"\nexit 0\n',
    );
    fs.chmodSync(path.join(mockDir, 'aws-configure'), 0o755);
  });

  beforeEach(() => {
    // バックアップ
    if (fs.existsSync(configPath)) fs.copyFileSync(configPath, backupPath);
    // PATH先頭に__mocks__追加
    process.env.PATH = mockDir + path.delimiter + origPath;
    process.env.TEST_MODE = '1';
  });
  afterEach(() => {
    // 復元
    if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, configPath);
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    process.env.PATH = origPath;
    delete process.env.TEST_MODE;
  });
  afterAll(() => {
    // モック削除
    fs.readdirSync(mockDir).forEach((f) => {
      const p = path.join(mockDir, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    if (fs.existsSync(mockDir)) fs.rmdirSync(mockDir);
  });

  test('設定ファイルが無い場合は自動生成されexitする', (done) => {
    console.time('設定ファイルが無い場合');
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    const env = { ...process.env, PATH: mockDir + path.delimiter + origPath };
    console.log('テスト実行時PATH:', env.PATH);
    const result = child_process.spawnSync('zsh', [scriptPath], {
      encoding: 'utf-8',
      timeout: 10000,
      env,
    });
    console.log('stdout:', result.stdout);
    console.log('stderr:', result.stderr);
    console.log('error:', result.error);
    expect(result.stdout).toMatch(/自動生成/);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(result.status).not.toBe(0);
    console.timeEnd('設定ファイルが無い場合');
    done();
  }, 10000);

  test('インスタンス起動からSSHまで高速で完了する', (done) => {
    console.time('インスタンス起動からSSHまで');
    fs.writeFileSync(
      configPath,
      'INSTANCE_ID="i-xxx"\nKEY_PATH="../keys/my-key.pem"\nUSER="ec2-user"\nREGION="ap-northeast-1"\nAWS_ACCESS_KEY_ID="dummy"\nAWS_SECRET_ACCESS_KEY="dummy"\nAWS_DEFAULT_REGION="ap-northeast-1"\n',
    );
    const env = { ...process.env, PATH: mockDir + path.delimiter + origPath };
    console.log('テスト実行時PATH:', env.PATH);
    const result = child_process.spawnSync('zsh', [scriptPath], {
      encoding: 'utf-8',
      timeout: 10000,
      env,
    });
    console.log('stdout:', result.stdout);
    console.log('stderr:', result.stderr);
    console.log('error:', result.error);
    expect(result.stdout).toMatch(/SSH接続/);
    expect(result.status).toBe(0);
    console.timeEnd('インスタンス起動からSSHまで');
    done();
  }, 10000);
});
