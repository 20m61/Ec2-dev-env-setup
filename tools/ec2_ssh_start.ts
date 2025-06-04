import fs from 'fs';
import { spawnSync } from 'child_process';

export interface Ec2SshConfig {
  INSTANCE_ID: string;
  KEY_PATH: string;
  USER: string;
  REGION: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_DEFAULT_REGION?: string;
}

export function loadConfig(configPath: string): Ec2SshConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`設定ファイル ${configPath} が見つかりません。`);
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  const config: Partial<Ec2SshConfig> = {};
  for (const line of content.split('\n')) {
    // セキュリティ: 変数名・値の妥当性を最低限チェック
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && /^[A-Z_][A-Z0-9_]*$/.test(m[1])) {
      (config as Record<string, string>)[m[1]] = m[2];
    }
  }
  return config as Ec2SshConfig;
}

export function ensureAwsCli(): void {
  if (spawnSync('aws', ['--version']).status !== 0) {
    throw new Error('aws CLIが見つかりません。インストールしてください。');
  }
}

export function setupAwsCredentials(cfg: Ec2SshConfig): void {
  if (cfg.AWS_ACCESS_KEY_ID && cfg.AWS_SECRET_ACCESS_KEY) {
    process.env.AWS_ACCESS_KEY_ID = cfg.AWS_ACCESS_KEY_ID;
    process.env.AWS_SECRET_ACCESS_KEY = cfg.AWS_SECRET_ACCESS_KEY;
    process.env.AWS_DEFAULT_REGION = cfg.AWS_DEFAULT_REGION || cfg.REGION;
  } else {
    throw new Error('AWS認証情報がありません。aws configureを実行してください。');
  }
}

export function startInstance(cfg: Ec2SshConfig): void {
  const r = spawnSync(
    'aws',
    ['ec2', 'start-instances', '--instance-ids', cfg.INSTANCE_ID, '--region', cfg.REGION],
    { encoding: 'utf-8' },
  );
  if (r.status !== 0) throw new Error('EC2インスタンス起動失敗: ' + (r.stderr || r.stdout));
}

export function waitForInstanceRunning(cfg: Ec2SshConfig, sleepMs = 5000): void {
  let count = 0;

  while (true) {
    const r = spawnSync(
      'aws',
      [
        'ec2',
        'describe-instances',
        '--instance-ids',
        cfg.INSTANCE_ID,
        '--region',
        cfg.REGION,
        '--query',
        'Reservations[0].Instances[0].State.Name',
        '--output',
        'text',
      ],
      { encoding: 'utf-8' },
    );
    if (r.stdout.trim() === 'running') break;
    if (process.env.TEST_MODE === '1') return;
    if (++count > 60) throw new Error('インスタンス起動がタイムアウトしました');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleepMs);
  }
}

export function getInstancePublicIp(cfg: Ec2SshConfig): string {
  const r = spawnSync(
    'aws',
    [
      'ec2',
      'describe-instances',
      '--instance-ids',
      cfg.INSTANCE_ID,
      '--region',
      cfg.REGION,
      '--query',
      'Reservations[0].Instances[0].PublicIpAddress',
      '--output',
      'text',
    ],
    { encoding: 'utf-8' },
  );
  const ip = r.stdout.trim();
  if (!ip || ip === 'None') throw new Error('パブリックIPが取得できません');
  return ip;
}

export function sshToInstance(cfg: Ec2SshConfig, ip: string): void {
  fs.chmodSync(cfg.KEY_PATH, 0o600);
  const r = spawnSync('ssh', ['-i', cfg.KEY_PATH, `${cfg.USER}@${ip}`], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('SSH接続失敗');
}

export async function main(configPath: string) {
  const cfg = loadConfig(configPath);
  ensureAwsCli();
  setupAwsCredentials(cfg);
  startInstance(cfg);
  waitForInstanceRunning(cfg);
  const ip = getInstancePublicIp(cfg);
  sshToInstance(cfg, ip);
}
