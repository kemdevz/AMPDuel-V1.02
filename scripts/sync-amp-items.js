import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'

const projectRoot = process.cwd()
const applyChanges = process.argv.includes('--apply')
const pruneStale = process.argv.includes('--prune')
const sourceOnly = process.argv.includes('--source-only')
const sourceUrl = 'https://elvebredd.com/adopt-me-calculator'
const imageBaseUrl = 'https://elvebredd.com/images/pets'
const batchSize = 200
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

function chunks(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function catalogKey(item) {
  return `${String(item.type || '').trim().toLowerCase()}\u0000${String(item.name || '').trim().toLowerCase()}`
}

function repairMojibake(value) {
  if (typeof value !== 'string') return value
  let repaired = value
  for (let index = 0; index < 2; index += 1) {
    if (!/[ÃÂâ]/.test(repaired)) break
    try {
      const candidate = Buffer.from(repaired, 'latin1').toString('utf8')
      if (!candidate || candidate.includes('\uFFFD') || candidate === repaired) break
      repaired = candidate
    } catch {
      break
    }
  }
  return repaired
}

function findJsonArray(source, startIndex) {
  const start = source.indexOf('[', startIndex)
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\' && inString) {
      escaped = true
      continue
    }
    if (character === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (character === '[') depth += 1
    if (character === ']') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return null
}

function fetchSourceHtml(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 45_000,
    }, (response) => {
      const status = Number(response.statusCode || 0)
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume()
        if (redirectCount >= 5) {
          reject(new Error('Elvebredd redirected too many times.'))
          return
        }
        resolve(fetchSourceHtml(new URL(response.headers.location, url), redirectCount + 1))
        return
      }
      if (status !== 200) {
        response.resume()
        reject(new Error(`Unable to fetch Elvebredd (${status}).`))
        return
      }
      response.setEncoding('utf8')
      let html = ''
      response.on('data', (chunk) => { html += chunk })
      response.on('end', () => resolve(html))
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('Elvebredd request timed out.')))
    request.on('error', reject)
  })
}

async function fetchPets() {
  const html = await fetchSourceHtml(sourceUrl)
  const chunkPattern = /self\.__next_f\.push\(\[1,"(.+?)"\]\)/g
  for (const match of html.matchAll(chunkPattern)) {
    if (!match[1].includes('initialPets')) continue
    let decoded
    try {
      decoded = JSON.parse(`"${match[1]}"`)
    } catch {
      continue
    }
    const markerIndex = decoded.indexOf('"initialPets":')
    if (markerIndex === -1) continue
    const arrayText = findJsonArray(decoded, markerIndex)
    if (!arrayText) continue
    const pets = JSON.parse(arrayText)
    if (Array.isArray(pets) && pets.length) return pets.filter((pet) => pet && typeof pet === 'object')
  }
  throw new Error("Elvebredd's current initialPets payload could not be found.")
}

function parseValue(rawValue) {
  if (rawValue == null || rawValue === false) return null
  const text = String(rawValue).trim().replaceAll(',', '')
  if (!text || text === '?') return null
  let value
  if (text.includes('-')) {
    const [left, right] = text.split('-', 2).map((part) => Number(part.trim()))
    if (!Number.isFinite(left) || !Number.isFinite(right)) return null
    value = (left + right) / 2
  } else {
    value = Number(text)
  }
  if (!Number.isFinite(value) || value <= 0) return null
  const normalized = Math.round((value + Number.EPSILON) * 10_000) / 10_000
  return normalized > 0 ? normalized : null
}

function variantName(name, { mega = false, neon = false, fly = false, ride = false } = {}) {
  let prefix = ''
  if (mega) prefix += 'M'
  else if (neon) prefix += 'N'
  if (fly) prefix += 'F'
  if (ride) prefix += 'R'
  return prefix ? `${prefix} ${name}` : name
}

function petImageUrl(pet, petName) {
  for (const key of ['image', 'imageUrl', 'image_url', 'icon', 'iconUrl', 'thumbnail', 'img', 'picture']) {
    const rawValue = pet?.[key]
    if (typeof rawValue !== 'string' || !rawValue.trim()) continue
    const value = repairMojibake(rawValue.trim())
    if (/^https?:\/\//i.test(value)) return value
    if (value.startsWith('/')) return `https://elvebredd.com${value}`
    return `${imageBaseUrl}/${value.split('/').map(encodeURIComponent).join('/')}`
  }
  return `${imageBaseUrl}/${encodeURIComponent(petName.replaceAll(' ', ''))}.png`
}

function buildCatalog(pets) {
  const petsByName = new Map()
  const duplicateBaseNames = new Set()
  for (const pet of pets) {
    const name = repairMojibake(String(pet?.name || '').trim())
    const key = name.toLowerCase()
    if (!name || ['nan', 'none', 'null'].includes(key)) continue
    if (petsByName.has(key)) duplicateBaseNames.add(name)
    petsByName.set(key, pet)
  }

  const catalog = new Map()
  const tiers = [
    { prefix: 'r', mega: false, neon: false },
    { prefix: 'n', mega: false, neon: true },
    { prefix: 'm', mega: true, neon: false },
  ]
  const modifiers = [
    { key: 'nopotion', fly: false, ride: false },
    { key: 'fly', fly: true, ride: false },
    { key: 'ride', fly: false, ride: true },
    { key: 'fly&ride', fly: true, ride: true },
  ]

  for (const pet of petsByName.values()) {
    const petName = repairMojibake(String(pet.name).trim())
    const imageUrl = petImageUrl(pet, petName)
    for (const tier of tiers) {
      const genericValue = parseValue(pet[`${tier.prefix}value`])
      for (const modifier of modifiers) {
        const specificValue = parseValue(pet[`${tier.prefix}value - ${modifier.key}`])
        const value = specificValue ?? (modifier.key === 'nopotion' ? genericValue : null)
        if (value == null) continue
        const name = variantName(petName, { ...tier, ...modifier })
        const row = { name, value, image_url: imageUrl, type: 'AMP' }
        const key = name.toLowerCase()
        const existing = catalog.get(key)
        if (existing && JSON.stringify(existing) !== JSON.stringify(row)) {
          throw new Error(`Conflicting AMP source rows for ${name}.`)
        }
        catalog.set(key, row)
      }
    }
  }

  if (duplicateBaseNames.size) {
    const preview = [...duplicateBaseNames].sort().slice(0, 10)
    const suffix = duplicateBaseNames.size > 10 ? ` (+${duplicateBaseNames.size - 10} more)` : ''
    console.log(`Elvebredd duplicate base names resolved (${duplicateBaseNames.size}): ${preview.join(', ')}${suffix}`)
  }
  return [...catalog.values()].sort((left, right) => right.value - left.value || left.name.localeCompare(right.name))
}

const pets = await fetchPets()
const sourceItems = buildCatalog(pets)
if (!sourceItems.length) throw new Error('Elvebredd returned no usable AMP item variations.')
const sourceKeys = new Set()
for (const item of sourceItems) {
  const key = catalogKey(item)
  if (sourceKeys.has(key)) throw new Error(`Duplicate AMP source item: ${item.name}`)
  sourceKeys.add(key)
}

const sourceValues = sourceItems.map((item) => item.value)
console.log(`Elvebredd base items: ${pets.length.toLocaleString('en-US')}`)
console.log(`Validated ${sourceItems.length.toLocaleString('en-US')} AMP variations.`)
console.log(`Exact fractional values preserved: ${sourceItems.filter((item) => !Number.isInteger(item.value)).length.toLocaleString('en-US')}.`)
console.log(`AMP value range: ${Math.min(...sourceValues)} to ${Math.max(...sourceValues)}.`)
console.log(`Rows without an image URL: ${sourceItems.filter((item) => !item.image_url).length}.`)

if (sourceOnly) {
  console.log('Source validation complete; Supabase was not accessed.')
  process.exit(0)
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required.')
}

const existingItems = await fetchAll(supabaseUrl, supabaseKey, 'items', 'id,name,value,image_url,type', { type: 'eq.AMP' })
const existingByKey = new Map(existingItems.map((item) => [catalogKey(item), item]))
const existingById = new Map(existingItems.map((item) => [String(item.id), item]))
const sourceByKey = new Map(sourceItems.map((item) => [catalogKey(item), item]))
const ownedItems = await fetchAll(
  supabaseUrl,
  supabaseKey,
  'inventory_items',
  'id,item_id,name,value,image_url,type',
  { type: 'eq.AMP' },
)
const ownedItemRepairs = ownedItems.flatMap((ownedItem) => {
  const linkedCatalogItem = existingById.get(String(ownedItem.item_id || ''))
  const sourceItem = sourceByKey.get(catalogKey(linkedCatalogItem || ownedItem))
  if (!sourceItem || !(Number(sourceItem.value) > 0)) return []
  const catalogItem = existingByKey.get(catalogKey(sourceItem))
  const needsRepair = Number(ownedItem.value) !== sourceItem.value
    || (!ownedItem.item_id && catalogItem?.id)
    || String(ownedItem.image_url || '') !== String(sourceItem.image_url || '')
  if (!needsRepair) return []
  return [{
    id: ownedItem.id,
    item_id: catalogItem?.id || ownedItem.item_id || null,
    value: sourceItem.value,
    image_url: sourceItem.image_url,
  }]
})
const updatedAt = new Date().toISOString()
const rows = sourceItems.map((item) => ({
  id: existingByKey.get(catalogKey(item))?.id || crypto.randomUUID(),
  ...item,
  updated_at: updatedAt,
}))
const rowIds = new Set(rows.map((item) => item.id))
const staleRows = existingItems.filter((item) => !rowIds.has(item.id))
const inserted = sourceItems.filter((item) => !existingByKey.has(catalogKey(item))).length
const updated = rows.length - inserted

console.log(`Live AMP catalog: ${existingItems.length.toLocaleString('en-US')} items.`)
console.log(`Will add ${inserted.toLocaleString('en-US')}, update ${updated.toLocaleString('en-US')}, and ${pruneStale ? 'remove' : 'leave'} ${staleRows.length.toLocaleString('en-US')} stale AMP rows.`)
console.log(`AMP inventory snapshots needing repair: ${ownedItemRepairs.length.toLocaleString('en-US')} of ${ownedItems.length.toLocaleString('en-US')}.`)
if (!applyChanges) {
  console.log('Preflight passed. Re-run with --apply to synchronize AMP catalog and inventory values.')
  process.exit(0)
}

for (const batch of chunks(rows, batchSize)) {
  await supabaseRequest(supabaseUrl, supabaseKey, 'items', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: batch,
  })
}

// Owned inventory rows deliberately snapshot catalog details so games remain
// deterministic. Refresh existing AMP snapshots when catalog values change;
// item_id is preferred and the unique variation name repairs older unlinked
// inventory rows.
for (const batch of chunks(ownedItemRepairs, 25)) {
  await Promise.all(batch.map((repair) => supabaseRequest(supabaseUrl, supabaseKey, 'inventory_items', {
    method: 'PATCH',
    query: { id: `eq.${repair.id}`, type: 'eq.AMP' },
    headers: { Prefer: 'return=minimal' },
    body: {
      item_id: repair.item_id,
      value: repair.value,
      image_url: repair.image_url,
      updated_at: updatedAt,
    },
  })))
}

if (pruneStale) {
  for (const batch of chunks(staleRows, batchSize)) {
    await supabaseRequest(supabaseUrl, supabaseKey, 'items', {
      method: 'DELETE',
      query: { id: `in.(${batch.map((item) => item.id).join(',')})`, type: 'eq.AMP' },
      headers: { Prefer: 'return=minimal' },
    })
  }
}

const finalItems = await fetchAll(supabaseUrl, supabaseKey, 'items', 'id,name,value', { type: 'eq.AMP' })
const finalNames = finalItems.map((item) => String(item.name || '').trim().toLowerCase())
const finalNameSet = new Set(finalNames)
const missingNames = sourceItems.filter((item) => !finalNameSet.has(item.name.toLowerCase())).map((item) => item.name)
const duplicateCount = finalNames.length - finalNameSet.size
if (missingNames.length || duplicateCount) {
  throw new Error(`AMP verification failed: missing=${missingNames.join(', ') || 'none'}, duplicate names=${duplicateCount}.`)
}
if (finalItems.some((item) => !(Number(item.value) > 0))) {
  throw new Error('AMP verification failed: the final catalog contains a non-positive value.')
}

console.log(`AMP sync complete: added ${inserted}, updated ${updated}, repaired ${ownedItemRepairs.length} inventory snapshots.`)
console.log(`Verified ${sourceItems.length} current AMP names in Supabase.`)
