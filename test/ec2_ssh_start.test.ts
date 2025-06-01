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
      `#!/bin/bash\nif [[ $1 == 'ec2' && $2 == 'describe-instances' ]]; then\n  if [[ $5 == '--query' && $6 == "'Reservations[0].Instances[0].State.Name'" ]]; then\n    echo running\n  elif [[ $5 == '--query' && $6 == "'Reservations[0].Instances[0].PublicIpAddress'" ]]; then\n    echo 203.0.113.10\n  fi\n  exit 0\nelif [[ $1 == 'ec2' && $2 == 'start-instances' ]]; then\n  exit 0\nfi\nexit 0\n`,
    );
    fs.chmodSync(path.join(mockDir, 'aws'), 0o755);
    // ssh モック
    fs.writeFileSync(path.join(mockDir, 'ssh'), '#!/bin/bash\nexit 0\n');
    fs.chmodSync(path.join(mockDir, 'ssh'), 0o755);
    // sleep モック
    fs.writeFileSync(path.join(mockDir, 'sleep'), '#!/bin/bash\nexit 0\n');
    fs.chmodSync(path.join(mockDir, 'sleep'), 0o755);
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
    ['aws', 'ssh', 'sleep'].forEach((f) => {
      const p = path.join(mockDir, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    if (fs.existsSync(mockDir)) fs.rmdirSync(mockDir);
  });

  test('設定ファイルが無い場合は自動生成されexitする', () => {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    const result = child_process.spawnSync('zsh', [scriptPath], { encoding: 'utf-8' });
    expect(result.stdout).toMatch(/自動生成/);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(result.status).not.toBe(0);
  });

  test('awsコマンドが無い場合brewインストールを促す', () => {
    // awsコマンドをPATHから除外
    process.env.PATH = origPath;
    const result = child_process.spawnSync('zsh', [scriptPath], { encoding: 'utf-8', input: '\n' });
    expect(result.stdout).toMatch(/aws CLIが見つかりません/);
  });

  test('AWS認証情報が無い場合aws configureを促す', () => {
    fs.writeFileSync(
      configPath,
      'INSTANCE_ID="i-xxx"\nKEY_PATH="../keys/my-key.pem"\nUSER="ec2-user"\nREGION="ap-northeast-1"\nAWS_ACCESS_KEY_ID=""\nAWS_SECRET_ACCESS_KEY=""\nAWS_DEFAULT_REGION="ap-northeast-1"\n',
    );
    const result = child_process.spawnSync('zsh', [scriptPath], { encoding: 'utf-8', input: '\n' });
    expect(result.stdout).toMatch(/aws configure/);
  });

  test('AWS認証情報があればexportされる', () => {
    fs.writeFileSync(
      configPath,
      'INSTANCE_ID="i-xxx"\nKEY_PATH="../keys/my-key.pem"\nUSER="ec2-user"\nREGION="ap-northeast-1"\nAWS_ACCESS_KEY_ID="dummy"\nAWS_SECRET_ACCESS_KEY="dummy"\nAWS_DEFAULT_REGION="ap-northeast-1"\n',
    );
    const result = child_process.spawnSync('zsh', [scriptPath], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
  });

  test('インスタンス起動からSSHまで高速で完了する', () => {
    fs.writeFileSync(
      configPath,
      'INSTANCE_ID="i-xxx"\nKEY_PATH="../keys/my-key.pem"\nUSER="ec2-user"\nREGION="ap-northeast-1"\nAWS_ACCESS_KEY_ID="dummy"\nAWS_SECRET_ACCESS_KEY="dummy"\nAWS_DEFAULT_REGION="ap-northeast-1"\n',
    );
    const result = child_process.spawnSync('zsh', [scriptPath], { encoding: 'utf-8' });
    expect(result.stdout).toMatch(/SSH接続/);
    expect(result.status).toBe(0);
  });
});
