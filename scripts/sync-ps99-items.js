import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const applyChanges = process.argv.includes('--apply')
const batchSize = 250
const pageSize = 1000

function loadEnvFile(fileName, override = false) {
  const envPath = path.resolve(projectRoot, fileName)
  if (!fs.existsSync(envPath)) return

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const normalizedLine = line.startsWith('export ') ? line.slice(7) : line
    const separatorIndex = normalizedLine.indexOf('=')
    if (separatorIndex === -1) continue

    const key = normalizedLine.slice(0, separatorIndex).trim()
    let value = normalizedLine.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (override || !process.env[key]) process.env[key] = value
  }
}

loadEnvFile('.env')
loadEnvFile('.env.local', true)

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required.')
}

function adminHeaders(additionalHeaders = {}) {
  return {
    apikey: supabaseKey,
    ...(!String(supabaseKey).startsWith('sb_secret_')
      ? { Authorization: `Bearer ${supabaseKey}` }
      : {}),
    ...additionalHeaders,
  }
}

async function request(table, { method = 'GET', query = {}, body, headers = {} } = {}) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)

  const response = await fetch(url, {
    method,
    headers: adminHeaders({
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    const details = (await response.text()).slice(0, 1000)
    throw new Error(`${method} ${table} failed (${response.status}): ${details}`)
  }

  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

async function fetchAll(table, select, filters = {}) {
  const rows = []

  for (let offset = 0; ; offset += pageSize) {
    const page = await request(table, {
      query: { select, ...filters },
      headers: { Range: `${offset}-${offset + pageSize - 1}` },
    })
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

function catalogKey(item) {
  return `${String(item.type || '').trim().toLowerCase()}\u0000${String(item.name || '').trim().toLowerCase()}`
}

function chunks(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

const sourcePath = path.resolve(projectRoot, 'src', 'Utils', 'ps99.json')
const sourceItems = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
  throw new Error('src/Utils/ps99.json must contain a non-empty JSON array.')
}

const normalizedSource = sourceItems.map((item, index) => {
  const name = String(item?.name || '').trim()
  const rawValue = Number(item?.value)
  const value = Math.round(rawValue)
  const type = String(item?.type || 'PS99').trim()

  if (!name) throw new Error(`Item ${index + 1} is missing a name.`)
  if (!Number.isFinite(rawValue) || !Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    throw new Error(`Item "${name}" has an invalid value for public.items.value: ${item?.value}`)
  }
  if (!type) throw new Error(`Item "${name}" is missing a type.`)

  return {
    name,
    value,
    image_url: String(item?.image_url || '').trim() || null,
    type,
  }
})

const sourceKeys = new Set()
for (const item of normalizedSource) {
  const key = catalogKey(item)
  if (sourceKeys.has(key)) throw new Error(`Duplicate source item: ${item.name} (${item.type})`)
  sourceKeys.add(key)
}

console.log(`Validated ${normalizedSource.length.toLocaleString('en-US')} PS99 source items.`)

const existingItems = await fetchAll(
  'items',
  'id,name,value,image_url,type,created_at,updated_at',
  { type: 'eq.PS99' },
)
const existingByKey = new Map(existingItems.map((item) => [catalogKey(item), item]))
const replacementRows = normalizedSource.map((item) => ({
  id: existingByKey.get(catalogKey(item))?.id || crypto.randomUUID(),
  ...item,
  updated_at: new Date().toISOString(),
}))
const replacementIds = new Set(replacementRows.map((item) => item.id))
const staleRows = existingItems.filter((item) => !replacementIds.has(item.id))

console.log(`Live PS99 catalog: ${existingItems.length.toLocaleString('en-US')} items.`)
console.log(`PS99 rows to upsert: ${replacementRows.length.toLocaleString('en-US')}; stale PS99 rows to remove: ${staleRows.length.toLocaleString('en-US')}.`)

if (!applyChanges) {
  console.log('Preflight passed. Re-run with --apply to sync only type=PS99 rows; MM2 and AMP remain untouched.')
  process.exit(0)
}

const backupDirectory = path.resolve(projectRoot, 'supabase', 'backups')
fs.mkdirSync(backupDirectory, { recursive: true })
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const backupPath = path.join(backupDirectory, `items-ps99-${timestamp}.json`)
fs.writeFileSync(backupPath, `${JSON.stringify(existingItems, null, 2)}\n`, 'utf8')
console.log(`Backed up the live PS99 catalog to ${path.relative(projectRoot, backupPath)}.`)

let processed = 0
for (const batch of chunks(replacementRows, batchSize)) {
  await request('items', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: batch,
  })
  processed += batch.length
  console.log(`Upserted ${processed.toLocaleString('en-US')}/${replacementRows.length.toLocaleString('en-US')} items.`)
}

for (const batch of chunks(staleRows, batchSize)) {
  await request('items', {
    method: 'DELETE',
    query: { id: `in.(${batch.map((item) => item.id).join(',')})` },
    headers: { Prefer: 'return=minimal' },
  })
}

const finalItems = await fetchAll('items', 'id', { type: 'eq.PS99' })
if (finalItems.length !== replacementRows.length) {
  throw new Error(`PS99 sync finished with ${finalItems.length} rows; expected ${replacementRows.length}.`)
}

console.log(`PS99 catalog sync complete: ${finalItems.length.toLocaleString('en-US')} items. MM2 and AMP were untouched.`)
