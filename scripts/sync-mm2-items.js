import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const projectRoot = process.cwd()
const applyChanges = process.argv.includes('--apply')
const sourceOnly = process.argv.includes('--source-only')
const batchSize = 200
const pageSize = 1000
const upstreamOwner = 'JonathanGao'
const upstreamRepo = 'MM2ValuesPlus'
const upstreamBranch = 'main'
const upstreamTables = ['ancients', 'chromas', 'godlies', 'legendaries']
const excludedPlaceholderNames = new Set(['black luger', 'mortal blade'])

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

function adminHeaders(key, additionalHeaders = {}) {
  return {
    apikey: key,
    ...(!String(key).startsWith('sb_secret_') ? { Authorization: `Bearer ${key}` } : {}),
    ...additionalHeaders,
  }
}

async function supabaseRequest(urlBase, key, table, { method = 'GET', query = {}, body, headers = {} } = {}) {
  const url = new URL(`/rest/v1/${table}`, urlBase)
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value)
  const response = await fetch(url, {
    method,
    headers: adminHeaders(key, {
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

async function fetchAll(urlBase, key, table, select, filters = {}) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseRequest(urlBase, key, table, {
      query: { select, limit: String(pageSize), offset: String(offset), ...filters },
    })
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'AMPDuel-MM2-sync' },
  })
  if (!response.ok) throw new Error(`Unable to fetch ${url} (${response.status}).`)
  return response.json()
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'AMPDuel-MM2-sync' } })
  if (!response.ok) throw new Error(`Unable to fetch ${url} (${response.status}).`)
  return Buffer.from(await response.arrayBuffer())
}

function chunks(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function catalogKey(item) {
  return [item.type, item.name, item.image_url]
    .map((value) => String(value || '').trim().toLowerCase())
    .join('\u0000')
}

function normalizeMm2Name(value) {
  return String(value || '').replace(/\s+\((?:knife|gun)\)\s*$/i, '').trim()
}

function encodePath(pathname) {
  return pathname.split('/').map(encodeURIComponent).join('/')
}

async function loadUpstreamItems() {
  const commit = await fetchJson(`https://api.github.com/repos/${upstreamOwner}/${upstreamRepo}/commits/${upstreamBranch}`)
  const commitSha = String(commit?.sha || '').trim()
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new Error('The MM2 upstream commit could not be resolved.')

  const tree = await fetchJson(`https://api.github.com/repos/${upstreamOwner}/${upstreamRepo}/git/trees/${commitSha}?recursive=1`)
  if (tree?.truncated) throw new Error('The MM2 upstream Git tree response was truncated.')
  const iconPaths = new Map(
    (Array.isArray(tree?.tree) ? tree.tree : [])
      .filter((entry) => entry?.type === 'blob' && /^static\/weaponIcons\/.*\.webp$/i.test(entry.path))
      .map((entry) => [path.posix.basename(entry.path, '.webp').toLowerCase(), entry.path]),
  )

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ampduel-mm2-'))
  const databasePath = path.join(temporaryDirectory, 'weapons.db')
  try {
    const databaseUrl = `https://raw.githubusercontent.com/${upstreamOwner}/${upstreamRepo}/${commitSha}/weapons.db`
    fs.writeFileSync(databasePath, await fetchBytes(databaseUrl))
    const database = new DatabaseSync(databasePath, { readOnly: true })
    const union = upstreamTables.map((table) => `SELECT '${table}' AS source_table, * FROM ${table}`).join(' UNION ALL ')
    const latestRows = database.prepare(`
      WITH combined AS (${union}), ranked AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY source_table, lower(trim(name))
          ORDER BY datetime(createdAt) DESC, id DESC
        ) AS row_number
        FROM combined
      )
      SELECT source_table, name, value FROM ranked
      WHERE row_number = 1
      ORDER BY lower(name), source_table
    `).all()
    database.close()

    const itemsByName = new Map()
    for (const row of latestRows) {
      const sourceName = String(row.name || '').trim()
      const sourceNameKey = sourceName.toLowerCase()
      const name = normalizeMm2Name(sourceName)
      const value = Number(row.value)
      if (!name || !Number.isFinite(value) || value <= 0 || excludedPlaceholderNames.has(sourceNameKey)) continue

      const iconPath = iconPaths.get(sourceNameKey) || iconPaths.get(name.toLowerCase())
      const item = {
        name,
        value,
        image_url: iconPath
          ? `https://raw.githubusercontent.com/${upstreamOwner}/${upstreamRepo}/${commitSha}/${encodePath(iconPath)}`
          : null,
        type: 'MM2',
        _source_name: sourceName,
      }
      const existing = itemsByName.get(sourceNameKey)
      if (!existing || (existing.value >= 1_000_000 && value < existing.value)) itemsByName.set(sourceNameKey, item)
    }

    return {
      commitSha,
      items: [...itemsByName.values()].sort((left, right) => right.value - left.value || left.name.localeCompare(right.name)),
    }
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

const { commitSha, items: sourceItems } = await loadUpstreamItems()
if (!sourceItems.length) throw new Error('The MM2 upstream repository returned no usable items.')

const sourceKeys = new Set()
for (const item of sourceItems) {
  const key = catalogKey(item)
  if (sourceKeys.has(key)) throw new Error(`Duplicate MM2 source item: ${item.name}`)
  sourceKeys.add(key)
}

const missingImages = sourceItems.filter((item) => !item.image_url)
const normalizedWeaponLabels = sourceItems.filter((item) => item._source_name !== item.name).length
console.log(`Upstream commit: ${commitSha}`)
console.log(`Validated ${sourceItems.length.toLocaleString('en-US')} current MM2 items.`)
console.log(`Removed trailing (Knife)/(Gun) labels from ${normalizedWeaponLabels} item names.`)
console.log(`Exact fractional values preserved: ${sourceItems.filter((item) => !Number.isInteger(item.value)).length}.`)
console.log(`Items without an upstream icon: ${missingImages.length}${missingImages.length ? ` (${missingImages.map((item) => item.name).join(', ')})` : ''}.`)

if (sourceOnly) {
  console.log('Source validation complete; Supabase was not accessed.')
  process.exit(0)
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required.')
}

const existingItems = await fetchAll(supabaseUrl, supabaseKey, 'items', 'id,name,value,image_url,type', { type: 'eq.MM2' })
const existingByImage = new Map()
const existingByName = new Map()
for (const item of existingItems) {
  const imageKey = String(item.image_url || '').trim().toLowerCase()
  if (imageKey) existingByImage.set(imageKey, item)
  const nameKey = String(item.name || '').trim().toLowerCase()
  if (!existingByName.has(nameKey)) existingByName.set(nameKey, [])
  existingByName.get(nameKey).push(item)
}
const claimedExistingIds = new Set()
const claimExistingItem = (item) => {
  const imageMatch = existingByImage.get(String(item.image_url || '').trim().toLowerCase())
  if (imageMatch && !claimedExistingIds.has(imageMatch.id)) {
    claimedExistingIds.add(imageMatch.id)
    return imageMatch
  }
  for (const name of [item._source_name, item.name]) {
    const available = (existingByName.get(String(name || '').trim().toLowerCase()) || [])
      .find((candidate) => !claimedExistingIds.has(candidate.id))
    if (available) {
      claimedExistingIds.add(available.id)
      return available
    }
  }
  return null
}
const timestamp = new Date().toISOString()
let inserted = 0
const rows = sourceItems.map((item) => {
  const existing = claimExistingItem(item)
  if (!existing) inserted += 1
  const databaseItem = { ...item }
  delete databaseItem._source_name
  return {
    id: existing?.id || crypto.randomUUID(),
    ...databaseItem,
    updated_at: timestamp,
  }
})
const updated = rows.length - inserted
const rowsById = new Map(rows.map((item) => [String(item.id), item]))
const rowsByKey = new Map(rows.map((item) => [catalogKey(item), item]))
const ownedItems = await fetchAll(
  supabaseUrl,
  supabaseKey,
  'inventory_items',
  'id,item_id,name,value,image_url,type',
  { type: 'eq.MM2' },
)
const ownedItemRepairs = ownedItems.flatMap((ownedItem) => {
  const catalogItem = rowsById.get(String(ownedItem.item_id || ''))
    || rowsByKey.get(catalogKey(ownedItem))
  const value = Number(catalogItem?.value)
  if (!catalogItem || !Number.isFinite(value) || value <= 0) return []
  const needsRepair = Number(ownedItem.value) !== value
    || String(ownedItem.item_id || '') !== String(catalogItem.id)
    || String(ownedItem.image_url || '') !== String(catalogItem.image_url || '')
  return needsRepair ? [{
    id: ownedItem.id,
    item_id: catalogItem.id,
    value,
    image_url: catalogItem.image_url,
  }] : []
})

console.log(`Live MM2 catalog: ${existingItems.length.toLocaleString('en-US')} items.`)
console.log(`Will add ${inserted.toLocaleString('en-US')} and update ${updated.toLocaleString('en-US')} MM2 rows.`)
console.log(`MM2 inventory snapshots needing repair: ${ownedItemRepairs.length.toLocaleString('en-US')} of ${ownedItems.length.toLocaleString('en-US')}.`)
if (!applyChanges) {
  console.log('Preflight passed. Re-run with --apply to synchronize Supabase.')
  process.exit(0)
}

for (const batch of chunks(rows, batchSize)) {
  await supabaseRequest(supabaseUrl, supabaseKey, 'items', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: batch,
  })
}

for (const batch of chunks(ownedItemRepairs, 25)) {
  await Promise.all(batch.map((repair) => supabaseRequest(supabaseUrl, supabaseKey, 'inventory_items', {
    method: 'PATCH',
    query: { id: `eq.${repair.id}`, type: 'eq.MM2' },
    headers: { Prefer: 'return=minimal' },
    body: {
      item_id: repair.item_id,
      value: repair.value,
      image_url: repair.image_url,
      updated_at: timestamp,
    },
  })))
}

const finalItems = await fetchAll(supabaseUrl, supabaseKey, 'items', 'id,name,value,image_url,type', { type: 'eq.MM2' })
const finalKeys = finalItems.map(catalogKey).sort()
const expectedKeys = sourceItems.map(catalogKey).sort()
if (finalKeys.length !== expectedKeys.length || finalKeys.some((key, index) => key !== expectedKeys[index])) {
  throw new Error('MM2 verification failed: the final name/image catalog does not match upstream.')
}
if (finalItems.some((item) => !(Number(item.value) > 0))) {
  throw new Error('MM2 verification failed: the final catalog contains a non-positive value.')
}

console.log(`MM2 sync complete: added ${inserted}, updated ${updated}, repaired ${ownedItemRepairs.length} inventory snapshots.`)
console.log(`Verified ${sourceItems.length} current upstream MM2 items in Supabase.`)
