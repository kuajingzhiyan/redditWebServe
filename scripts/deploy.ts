/**
 * 上传源码到服务器并通过 Docker Compose 构建、启动 API + MySQL
 * 配置：复制 .env.deploy.example 为 .env.deploy
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, type ConnectConfig } from 'ssh2'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const UPLOAD_IGNORE = new Set([
  'node_modules',
  'dist',
  '.git',
  '.env',
  '.env.deploy',
  '.cache',
  '.DS_Store',
])

const REMOTE_ENV_KEYS = [
  'MYSQL_ROOT_PASSWORD',
  'MYSQL_DATABASE',
  'MYSQL_PORT',
  'API_PORT',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'GOOGLE_CLIENT_ID',
  'CORS_ORIGINS',
] as const

function loadEnv(filePath: string) {
  if (!existsSync(filePath))
    return
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const i = trimmed.indexOf('=')
    if (i === -1)
      continue
    const key = trimmed.slice(0, i).trim()
    let val = trimmed.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\'')))
      val = val.slice(1, -1)
    if (!(key in process.env))
      process.env[key] = val
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`[deploy] 缺少 ${name}，请在 .env.deploy 中配置`)
    process.exit(1)
  }
  return value
}

function assertSafeRemotePath(remotePath: string) {
  if (!remotePath.startsWith('/'))
    throw new Error(`DEPLOY_PATH 必须是绝对路径，当前：${remotePath}`)
  if (remotePath.includes('\n') || remotePath.includes('..'))
    throw new Error('DEPLOY_PATH 含非法字符')
}

function shellQuoteRemote(p: string) {
  return `'${p.replace(/'/g, `'\\''`)}'`
}

function walkFiles(dir: string, baseLen: number): { rel: string; abs: string }[] {
  const out: { rel: string; abs: string }[] = []
  for (const name of readdirSync(dir)) {
    if (UPLOAD_IGNORE.has(name))
      continue
    const abs = path.join(dir, name)
    const rel = abs.slice(baseLen).replace(/^[/\\]/, '')
    const st = statSync(abs)
    if (st.isDirectory())
      out.push(...walkFiles(abs, baseLen))
    else
      out.push({ rel: rel.replace(/\\/g, '/'), abs })
  }
  return out
}

function collectRemoteDirs(remoteBase: string, relPaths: string[]): string[] {
  const set = new Set<string>()
  for (const rel of relPaths) {
    const posix = rel.replace(/\\/g, '/')
    const dir = posix.includes('/') ? posix.slice(0, posix.lastIndexOf('/')) : ''
    if (!dir)
      continue
    const segments = dir.split('/')
    for (let i = 1; i <= segments.length; i++) {
      const sub = segments.slice(0, i).join('/')
      set.add(`${remoteBase}/${sub}`)
    }
  }
  return [...set].sort((a, b) => a.length - b.length)
}

function buildRemoteEnvContent(): string {
  const lines: string[] = []
  for (const key of REMOTE_ENV_KEYS) {
    const value = process.env[key]?.trim()
    if (!value) {
      console.error(`[deploy] 缺少生产变量 ${key}，请在 .env.deploy 中配置`)
      process.exit(1)
    }
    lines.push(`${key}=${value}`)
  }
  return `${lines.join('\n')}\n`
}

function connectSsh(cfg: ConnectConfig): Promise<Client> {
  const readyTimeoutMs = Number(process.env.DEPLOY_SSH_READY_TIMEOUT_MS?.trim() || '20000')
  return new Promise((resolve, reject) => {
    const conn = new Client()
    conn
      .on('ready', () => resolve(conn))
      .on('error', reject)
    conn.connect({ ...cfg, readyTimeout: Number.isFinite(readyTimeoutMs) ? readyTimeoutMs : 20000 })
  })
}

function execRemote(conn: Client, command: string, label?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err)
        return
      }
      let stdout = ''
      let errTail = ''
      stream.on('data', (d: Buffer) => { stdout += d.toString() })
      stream.stderr.on('data', (d: Buffer) => {
        errTail += d.toString()
        if (errTail.length > 8000)
          errTail = errTail.slice(-4000)
      })
      stream.on('close', (code) => {
        if (code === 0) {
          if (label)
            console.log(`[deploy] ${label} ✓`)
          resolve()
        }
        else {
          const hint = (errTail || stdout).trim() || '(无输出)'
          reject(new Error(`${label ?? 'SSH exec'} exit ${code}: ${hint}`))
        }
      })
    })
  })
}

function uploadText(sftp: import('ssh2').SFTPWrapper, remotePath: string, content: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath, { encoding: 'utf8' })
    stream.on('error', reject)
    stream.on('close', () => resolve())
    stream.end(content)
  })
}

function sftpFastPut(sftp: import('ssh2').SFTPWrapper, localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, {}, (putErr) => {
      if (putErr)
        reject(putErr)
      else
        resolve()
    })
  })
}

loadEnv(path.join(projectRoot, '.env.deploy'))

const host = requireEnv('DEPLOY_HOST')
const user = requireEnv('DEPLOY_USER')
const deployPath = requireEnv('DEPLOY_PATH').replace(/\/+$/, '')
const port = Number(process.env.DEPLOY_PORT?.trim() || '22')
const sshKey = process.env.DEPLOY_KEY?.trim()
const sshPassword = process.env.DEPLOY_PASSWORD?.trim()

assertSafeRemotePath(deployPath)

const files = walkFiles(projectRoot, projectRoot.length)
console.log(`[deploy] SSH ${user}@${host}:${port} -> ${deployPath}`)
console.log(`[deploy] 待上传文件数: ${files.length}`)

function buildConnectConfig(): ConnectConfig {
  const config: ConnectConfig = { host, port, username: user }
  if (sshKey)
    config.privateKey = readFileSync(sshKey)
  else if (sshPassword)
    config.password = sshPassword
  else {
    console.error('[deploy] 请在 .env.deploy 中配置 DEPLOY_KEY 或 DEPLOY_PASSWORD')
    process.exit(1)
  }
  return config
}

;(async () => {
  console.log('\n[deploy] 连接 SSH...')
  const conn = await connectSsh(buildConnectConfig())
  console.log('[deploy] SSH 已连接')

  try {
    await execRemote(conn, `mkdir -p ${shellQuoteRemote(deployPath)}`, '创建部署目录')

    const relList = files.map(f => f.rel)
    const mkdirChunks = collectRemoteDirs(deployPath, relList).map(d => `mkdir -p ${shellQuoteRemote(d)}`)
    if (mkdirChunks.length > 0) {
      const MAX_BATCH = 60
      for (let i = 0; i < mkdirChunks.length; i += MAX_BATCH)
        await execRemote(conn, mkdirChunks.slice(i, i + MAX_BATCH).join(' && '))
    }

    const sftp = await new Promise<import('ssh2').SFTPWrapper>((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err)
          reject(err)
        else if (sftp)
          resolve(sftp)
        else
          reject(new Error('SFTP 未就绪'))
      })
    })

    let n = 0
    for (const { rel, abs } of files) {
      await sftpFastPut(sftp, abs, `${deployPath}/${rel}`)
      n++
      if (n % 30 === 0 || n === files.length)
        console.log(`[deploy] 已上传 ${n}/${files.length}`)
    }

    const remoteEnvPath = `${deployPath}/.env`
    await uploadText(sftp, remoteEnvPath, buildRemoteEnvContent())
    console.log('[deploy] 已写入远端 .env')

    // 生产机可能已有 MySQL 占用 3306，compose 内 MySQL 不再映射宿主机端口
    const apiPort = process.env.API_PORT?.trim() || '3100'
    const deployCmd = [
      'command -v docker >/dev/null 2>&1 || (DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2 curl && systemctl enable --now docker)',
      'systemctl stop auth-api.service 2>/dev/null || true',
      'systemctl disable auth-api.service 2>/dev/null || true',
      `for pid in $(ss -lntp 2>/dev/null | grep ":${apiPort}" | sed -n 's/.*pid=\\([0-9]*\\).*/\\1/p'); do kill "$pid" 2>/dev/null || true; done`,
      'sleep 2',
      `cd ${shellQuoteRemote(deployPath)}`,
      'docker compose up -d --build',
      'docker compose ps',
      `for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:${apiPort}/health && break; sleep 2; done`,
    ].join(' && ')

    console.log('\n[deploy] 构建并启动容器...')
    await execRemote(conn, deployCmd, 'docker compose up')
  }
  finally {
    conn.end()
  }

  console.log('\n[deploy] 完成')
})().catch((err) => {
  console.error('[deploy] 失败:', err)
  process.exit(1)
})
