import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'ssh2'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv(filePath: string) {
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
    process.env[key] ??= val
  }
}

function exec(conn: Client, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err)
        return
      }
      let out = ''
      stream.on('data', (d: Buffer) => { out += d.toString() })
      stream.stderr.on('data', (d: Buffer) => { out += d.toString() })
      stream.on('close', (code) => {
        if (code === 0)
          resolve(out)
        else
          reject(new Error(out || `exit ${code}`))
      })
    })
  })
}

loadEnv(path.join(root, '.env.deploy'))

const apiPort = process.env.API_PORT?.trim() || '3100'

const conn = new Client()
conn.on('ready', async () => {
  try {
    const out = await exec(conn, [
      'cd /opt/node-api-service && docker compose ps',
      `curl -fsS http://127.0.0.1:${apiPort}/health`,
      `curl -sS -o /dev/null -w "nginx_login_http=%{http_code}\\n" -X POST http://127.0.0.1/api/auth/login -H "Content-Type: application/json" -d '{"email":"a@b.com","password":"short"}'`,
    ].join(' && '))
    console.log(out)
  }
  catch (error) {
    console.error('[verify] 失败:', error)
    process.exitCode = 1
  }
  finally {
    conn.end()
  }
})
conn.connect({
  host: process.env.DEPLOY_HOST,
  port: Number(process.env.DEPLOY_PORT || 22),
  username: process.env.DEPLOY_USER,
  password: process.env.DEPLOY_PASSWORD,
})
