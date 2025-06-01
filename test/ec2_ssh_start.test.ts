import fs from 'fs';
import path from 'path';
import child_process from 'child_process';

describe('tools/ec2_ssh_start.sh', () => {
  const configPath = path.join(__dirname, '../tools/ec2_ssh_config');
  const scriptPath = path.join(__dirname, '../tools/ec2_ssh_start.sh');
  const backupPath = configPath + '.bak';

  beforeEach(() => {
    // バックアップ
    if (fs.existsSync(configPath)) fs.copyFileSync(configPath, backupPath);
  });
  afterEach(() => {
    // 復元
    if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, configPath);
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  });

  test('設定ファイルが無い場合は自動生成されexitする', () => {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    const result = child_process.spawnSync('zsh', [scriptPath], { encoding: 'utf-8' });
    expect(result.stdout).toMatch(/自動生成/);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(result.status).not.toBe(0);
  });

  test('awsコマンドが無い場合brewインストールを促す', () => {
    // awsコマンドをモック
    const orig = process.env.PATH;
    process.env.PATH = '';
    const result = child_process.spawnSync('zsh', [scriptPath], { encoding: 'utf-8', input: '\n' });
    expect(result.stdout).toMatch(/aws CLIが見つかりません/);
    process.env.PATH = orig;
  });

  test('AWS認証情報が無い場合aws configureを促す', () => {
    // 設定ファイルを空に
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
    // awsコマンドをechoにモック
    const script = `command() { return 0; }; export -f command; source ${scriptPath}`;
    const result = child_process.spawnSync('zsh', ['-c', script], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
  });

  // 他にも異常系やパスのバリエーションを追加可能
});
