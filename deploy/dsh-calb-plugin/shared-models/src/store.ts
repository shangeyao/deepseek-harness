import { mkdir, readFile, writeFile, access, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Document, parseDocument } from 'yaml'
import { MODEL_SETTINGS_NAMESPACES } from './namespaces.js'

const SETTINGS_FILENAME = 'settings.yaml'
const CREDENTIALS_FILENAME = 'credentials.yaml'

/** Directory holding platform-wide model settings copied to every user. */
export function sharedModelsDir(dataRoot: string): string {
  return join(dataRoot, 'shared', 'models')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readYamlMap(path: string): Promise<Record<string, unknown>> {
  if (!(await pathExists(path))) return {}
  const text = await readFile(path, 'utf8')
  if (text.trim() === '') return {}
  const doc = parseDocument(text)
  const value = doc.toJSON()
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

async function writeYamlMap(path: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const doc = new Document(value)
  await writeFile(path, `${String(doc)}`, 'utf8')
}

/**
 * Merge platform model namespaces from the shared store into one user's harness home.
 * @param sharedDir - `$DSH_DATA_ROOT/shared/models`.
 * @param dshHome - per-user `.dsh` directory.
 */
export async function syncSharedModelsToUser(sharedDir: string, dshHome: string): Promise<void> {
  const sharedSettingsPath = join(sharedDir, SETTINGS_FILENAME)
  if (!(await pathExists(sharedSettingsPath))) return

  const sharedSettings = await readYamlMap(sharedSettingsPath)
  const userSettingsPath = join(dshHome, SETTINGS_FILENAME)
  const userSettings = await readYamlMap(userSettingsPath)

  let changed = false
  for (const ns of MODEL_SETTINGS_NAMESPACES) {
    if (sharedSettings[ns] === undefined) continue
    userSettings[ns] = structuredClone(sharedSettings[ns])
    changed = true
  }
  if (changed) {
    await mkdir(dshHome, { recursive: true })
    await writeYamlMap(userSettingsPath, userSettings)
  }

  const sharedCredentialsPath = join(sharedDir, CREDENTIALS_FILENAME)
  const userCredentialsPath = join(dshHome, '.credentials.yaml')
  if (await pathExists(sharedCredentialsPath)) {
    await mkdir(dshHome, { recursive: true })
    await copyFile(sharedCredentialsPath, userCredentialsPath)
  }
}

/**
 * Copy model-related namespaces and credentials from the super admin home into the shared store.
 * @param sharedDir - `$DSH_DATA_ROOT/shared/models`.
 * @param adminDshHome - super admin `.dsh` directory.
 */
export async function publishAdminModelsToShared(sharedDir: string, adminDshHome: string): Promise<void> {
  await mkdir(sharedDir, { recursive: true })

  const adminSettings = await readYamlMap(join(adminDshHome, SETTINGS_FILENAME))
  const sharedSettings: Record<string, unknown> = {}
  for (const ns of MODEL_SETTINGS_NAMESPACES) {
    if (adminSettings[ns] !== undefined) sharedSettings[ns] = structuredClone(adminSettings[ns])
  }
  if (Object.keys(sharedSettings).length > 0) {
    await writeYamlMap(join(sharedDir, SETTINGS_FILENAME), sharedSettings)
  }

  const adminCredentialsPath = join(adminDshHome, '.credentials.yaml')
  if (await pathExists(adminCredentialsPath)) {
    await copyFile(adminCredentialsPath, join(sharedDir, CREDENTIALS_FILENAME))
  }
}

/**
 * Push the shared model store to every user harness home under a data root.
 * @param dataRoot - gateway `DSH_DATA_ROOT`.
 */
export async function fanoutSharedModelsToAllUsers(dataRoot: string): Promise<void> {
  const sharedDir = sharedModelsDir(dataRoot)
  const usersDir = join(dataRoot, 'users')
  if (!(await pathExists(usersDir))) return

  const { readdir } = await import('node:fs/promises')
  for (const userId of await readdir(usersDir)) {
    const dshHome = join(usersDir, userId, '.dsh')
    if (await pathExists(dshHome)) {
      await syncSharedModelsToUser(sharedDir, dshHome)
    }
  }
}
