import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

export function loadLocalEnv() {
  if (existsSync('invoice/.env.local')) loadEnvFile('invoice/.env.local')
}
