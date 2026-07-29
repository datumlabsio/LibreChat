import isPlainObject from 'lodash/isPlainObject';
import { envVarRegex } from 'librechat-data-provider';
import { encryptV3, decryptV3, logger } from '@librechat/data-schemas';
import { isUserProvided } from '~/utils/common';

const ENCRYPTED_PREFIX = 'v3:';

/**
 * A secret stored as a scalar field on a top-level config section,
 * e.g. `langfuse.secretKey`.
 */
interface SectionSecretSpec {
  section: string;
  secretKey: string;
  displayKey: string;
  secretPath: string;
  displayPath: string;
}

/**
 * A secret stored on items of an array field under a top-level config section,
 * e.g. `endpoints.custom[*].apiKey`.
 */
interface ArraySecretSpec {
  section: string;
  arrayField: string;
  secretKey: string;
  displayKey: string;
  /** Item field used to match entries across writes for omit-to-keep round-trips. */
  identityKey: string;
  arrayPath: string;
  /** Reference values that must stay readable and never encrypt, e.g. `user_provided`, `${ENV_VAR}`. */
  isPassthroughValue: (value: string) => boolean;
}

const LANGFUSE_SECRET: SectionSecretSpec = {
  section: 'langfuse',
  secretKey: 'secretKey',
  displayKey: 'displaySecretKey',
  secretPath: 'langfuse.secretKey',
  displayPath: 'langfuse.displaySecretKey',
};

const CUSTOM_ENDPOINT_SECRET: ArraySecretSpec = {
  section: 'endpoints',
  arrayField: 'custom',
  secretKey: 'apiKey',
  displayKey: 'displayApiKey',
  identityKey: 'name',
  arrayPath: 'endpoints.custom',
  isPassthroughValue: (value) => isUserProvided(value) || envVarRegex.test(value),
};

/**
 * Registry of admin-config secret locations. Every write/read/preserve/redact
 * entry point below fans out over these specs, so recognizing a new sensitive
 * field means adding a spec here (plus its display companion in the config
 * schema), not new plumbing.
 */
const SECTION_SECRET_SPECS: SectionSecretSpec[] = [LANGFUSE_SECRET];
const ARRAY_SECRET_SPECS: ArraySecretSpec[] = [CUSTOM_ENDPOINT_SECRET];

/**
 * Masked preview of a secret. Values shorter than 12 characters mask fully —
 * the first-six/last-four slices would otherwise overlap and reveal the
 * entire credential.
 */
export function getDisplaySecretKey(secret: string): string {
  if (secret.length < 12) {
    return '...';
  }
  return secret.slice(0, 6) + '...' + secret.slice(-4);
}

function normalizeSecretString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function isEncryptedConfigSecret(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith(ENCRYPTED_PREFIX);
}

function getPlainRecord(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? (value as Record<string, unknown>) : null;
}

function getSectionRecord(
  root: unknown,
  spec: SectionSecretSpec,
  basePath = '',
): Record<string, unknown> | null {
  const rootRecord = getPlainRecord(root);
  if (!rootRecord) {
    return null;
  }
  if (basePath === spec.section) {
    return rootRecord;
  }
  if (basePath === '') {
    return getPlainRecord(rootRecord[spec.section]);
  }
  return null;
}

function getSecretArray(root: unknown, spec: ArraySecretSpec, basePath = ''): unknown[] | null {
  if (basePath === spec.arrayPath) {
    return Array.isArray(root) ? root : null;
  }
  let container: Record<string, unknown> | null = null;
  if (basePath === spec.section) {
    container = getPlainRecord(root);
  } else if (basePath === '') {
    container = getPlainRecord(getPlainRecord(root)?.[spec.section]);
  }
  const array = container?.[spec.arrayField];
  return Array.isArray(array) ? array : null;
}

export function decryptConfigSecret(value: unknown): string | undefined {
  const normalized = normalizeSecretString(value);
  if (!normalized || !normalized.startsWith(ENCRYPTED_PREFIX)) {
    return undefined;
  }
  try {
    return decryptV3(normalized);
  } catch (error) {
    logger.warn('[adminConfig] Failed to decrypt config secret', error);
    return undefined;
  }
}

/**
 * Resolves a possibly-encrypted config value for runtime use: encrypted values
 * decrypt, everything else passes through unchanged. Decryption failures return
 * an empty string (never the ciphertext) so downstream requests fail visibly
 * instead of sending an encrypted blob as a credential.
 */
export function resolveConfigSecretValue(value: string): string {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }
  try {
    return decryptV3(value);
  } catch (error) {
    logger.error(
      '[adminConfig] Failed to decrypt config secret for runtime use; verify CREDS_KEY has not changed',
      error,
    );
    return '';
  }
}

/**
 * Returns a copy of a custom endpoint config with its stored `apiKey`
 * decrypted for runtime use; unencrypted configs return unchanged.
 */
export function resolveCustomEndpointSecrets<T extends { apiKey?: string }>(endpointConfig: T): T {
  const apiKey = endpointConfig.apiKey;
  if (typeof apiKey !== 'string' || !apiKey.startsWith(ENCRYPTED_PREFIX)) {
    return endpointConfig;
  }
  return { ...endpointConfig, apiKey: resolveConfigSecretValue(apiKey) };
}

export function getConfigSecretMutationPaths(fieldPath: string): string[] {
  for (const spec of SECTION_SECRET_SPECS) {
    if (fieldPath === spec.secretPath) {
      return [spec.secretPath, spec.displayPath];
    }
  }
  return [fieldPath];
}

export function isConfigSecretDescendantPath(fieldPath: string): boolean {
  return SECTION_SECRET_SPECS.some(
    (spec) =>
      fieldPath.startsWith(`${spec.secretPath}.`) || fieldPath.startsWith(`${spec.displayPath}.`),
  );
}

export function isConfigSecretAncestorPath(fieldPath: string): boolean {
  return (
    SECTION_SECRET_SPECS.some((spec) => spec.section === fieldPath) ||
    ARRAY_SECRET_SPECS.some((spec) => spec.section === fieldPath || spec.arrayPath === fieldPath)
  );
}

/**
 * Whether a patched value at `fieldPath` is shaped such that omitted secrets
 * should be preserved from the existing overrides (omit-to-keep round-trips
 * of redacted admin reads).
 */
export function isConfigSecretPreservablePatch(fieldPath: string, value: unknown): boolean {
  if (SECTION_SECRET_SPECS.some((spec) => spec.section === fieldPath)) {
    return isPlainObject(value);
  }
  for (const spec of ARRAY_SECRET_SPECS) {
    if (fieldPath === spec.section) {
      return isPlainObject(value);
    }
    if (fieldPath === spec.arrayPath) {
      return Array.isArray(value);
    }
  }
  return false;
}

/** Whether full-document overrides contain any section whose omitted secrets must be preserved. */
export function configOverridesNeedSecretPreservation(overrides: unknown): boolean {
  const root = getPlainRecord(overrides);
  if (!root) {
    return false;
  }
  const sections = new Set<string>([
    ...SECTION_SECRET_SPECS.map((spec) => spec.section),
    ...ARRAY_SECRET_SPECS.map((spec) => spec.section),
  ]);
  return [...sections].some((section) => isConfigSecretPreservablePatch(section, root[section]));
}

/** Numeric indices plus MongoDB positional operators (`$`, `$[]`, `$[id]`). */
function isArrayIndexSegment(segment: string): boolean {
  return /^\d+$/.test(segment) || segment.includes('$');
}

function getIndexedSecretPathError(fieldPath: string): string | null {
  for (const spec of ARRAY_SECRET_SPECS) {
    const prefix = `${spec.arrayPath}.`;
    if (!fieldPath.startsWith(prefix)) {
      continue;
    }
    const segments = fieldPath.slice(prefix.length).split('.');
    if (!isArrayIndexSegment(segments[0])) {
      continue;
    }
    if (
      segments.length > 1 &&
      (segments[1] === spec.secretKey || segments[1] === spec.displayKey)
    ) {
      return `Cannot write secret fields by array index: ${fieldPath}. Write the ${spec.arrayPath} array instead`;
    }
  }
  return null;
}

function isIndexedEntryPath(fieldPath: string, spec: ArraySecretSpec): boolean {
  const prefix = `${spec.arrayPath}.`;
  if (!fieldPath.startsWith(prefix)) {
    return false;
  }
  return isArrayIndexSegment(fieldPath.slice(prefix.length));
}

function getEncryptedArrayEntryError(
  entries: unknown[] | null,
  spec: ArraySecretSpec,
): string | null {
  if (!entries) {
    return null;
  }
  const hasEncrypted = entries.some((entry) =>
    isEncryptedConfigSecret(getPlainRecord(entry)?.[spec.secretKey]),
  );
  return hasEncrypted
    ? `Encrypted config secret values cannot be submitted: ${spec.arrayPath}[].${spec.secretKey}`
    : null;
}

function getMalformedContainerError(value: unknown, spec: ArraySecretSpec): string | null {
  return value != null && !Array.isArray(value)
    ? `Protected secret container must be an array: ${spec.arrayPath}`
    : null;
}

export function getConfigSecretInputError(fieldPath: string, value: unknown): string | null {
  for (const spec of SECTION_SECRET_SPECS) {
    if (fieldPath === spec.displayPath) {
      return `Cannot write protected display secret path: ${fieldPath}`;
    }
    if (fieldPath === spec.secretPath && isEncryptedConfigSecret(value)) {
      return `Encrypted config secret values cannot be submitted: ${fieldPath}`;
    }
    if (fieldPath === spec.section) {
      if (Array.isArray(value)) {
        return `Cannot patch protected secret ancestor as an array: ${fieldPath}`;
      }
      const section = getPlainRecord(value);
      if (section && isEncryptedConfigSecret(section[spec.secretKey])) {
        return `Encrypted config secret values cannot be submitted: ${spec.secretPath}`;
      }
    }
  }

  const indexedError = getIndexedSecretPathError(fieldPath);
  if (indexedError) {
    return indexedError;
  }

  for (const spec of ARRAY_SECRET_SPECS) {
    if (fieldPath === spec.section) {
      if (Array.isArray(value)) {
        return `Cannot patch protected secret ancestor as an array: ${fieldPath}`;
      }
      const container = getPlainRecord(value)?.[spec.arrayField];
      const error =
        getMalformedContainerError(container, spec) ??
        getEncryptedArrayEntryError(getSecretArray(value, spec, spec.section), spec);
      if (error) {
        return error;
      }
    }
    if (fieldPath === spec.arrayPath) {
      const error =
        getMalformedContainerError(value, spec) ??
        getEncryptedArrayEntryError(getSecretArray(value, spec, spec.arrayPath), spec);
      if (error) {
        return error;
      }
    }
    if (isIndexedEntryPath(fieldPath, spec)) {
      return `Cannot replace ${spec.arrayPath} entries by array index: ${fieldPath}. Write the ${spec.arrayPath} array instead`;
    }
  }
  return null;
}

function applySectionSecretWrite(section: Record<string, unknown>, spec: SectionSecretSpec): void {
  if (!(spec.secretKey in section)) {
    delete section[spec.displayKey];
    return;
  }

  const value = section[spec.secretKey];
  if (typeof value !== 'string' || value.length === 0 || value.startsWith(ENCRYPTED_PREFIX)) {
    section[spec.secretKey] = '';
    section[spec.displayKey] = '';
    return;
  }

  section[spec.secretKey] = encryptV3(value);
  section[spec.displayKey] = getDisplaySecretKey(value);
}

function applyArraySecretWrites(entries: unknown[], spec: ArraySecretSpec): void {
  for (const item of entries) {
    const entry = getPlainRecord(item);
    if (!entry) {
      continue;
    }
    if (!(spec.secretKey in entry)) {
      delete entry[spec.displayKey];
      continue;
    }
    const value = entry[spec.secretKey];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith(ENCRYPTED_PREFIX)) {
      entry[spec.secretKey] = '';
      entry[spec.displayKey] = '';
      continue;
    }
    if (spec.isPassthroughValue(value.trim())) {
      delete entry[spec.displayKey];
      continue;
    }
    entry[spec.secretKey] = encryptV3(value);
    entry[spec.displayKey] = getDisplaySecretKey(value);
  }
}

/**
 * Deletes a present non-array protected container (e.g. an object-valued
 * `endpoints.custom`) so malformed input can never carry secrets past the
 * encryption and redaction traversals.
 */
function removeMalformedSecretContainer(root: unknown, spec: ArraySecretSpec, basePath = ''): void {
  let container: Record<string, unknown> | null = null;
  if (basePath === spec.section) {
    container = getPlainRecord(root);
  } else if (basePath === '') {
    container = getPlainRecord(getPlainRecord(root)?.[spec.section]);
  }
  if (
    container != null &&
    container[spec.arrayField] != null &&
    !Array.isArray(container[spec.arrayField])
  ) {
    delete container[spec.arrayField];
  }
}

function removeFlatSecretPathKeys(root: Record<string, unknown>): void {
  for (const spec of SECTION_SECRET_SPECS) {
    delete root[spec.secretPath];
    delete root[spec.displayPath];
    if (Array.isArray(root[spec.section])) {
      delete root[spec.section];
    }
  }
  for (const spec of ARRAY_SECRET_SPECS) {
    if (Array.isArray(root[spec.section])) {
      delete root[spec.section];
    }
    for (const key of Object.keys(root)) {
      if (key === spec.arrayPath || key.startsWith(`${spec.arrayPath}.`)) {
        delete root[key];
      }
    }
  }
}

/**
 * Returns a new field map with registered secret entries encrypted and their
 * display companions set. Empty values reset the secret and its display key.
 */
export function encryptConfigSecretFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...fields };

  for (const spec of SECTION_SECRET_SPECS) {
    if (Array.isArray(result[spec.section])) {
      delete result[spec.section];
    } else {
      const section = getPlainRecord(result[spec.section]);
      if (section) {
        result[spec.section] = encryptConfigSecrets(section, spec.section);
      }
    }

    if (!(spec.secretPath in result) && spec.displayPath in result) {
      delete result[spec.displayPath];
    }

    if (spec.secretPath in result) {
      const value = result[spec.secretPath];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith(ENCRYPTED_PREFIX)) {
        result[spec.secretPath] = '';
        result[spec.displayPath] = '';
      } else {
        result[spec.secretPath] = encryptV3(value);
        result[spec.displayPath] = getDisplaySecretKey(value);
      }
    }
  }

  for (const spec of ARRAY_SECRET_SPECS) {
    for (const key of Object.keys(result)) {
      if (getIndexedSecretPathError(key) !== null) {
        delete result[key];
        continue;
      }
      if (key !== spec.section && key !== spec.arrayPath) {
        continue;
      }
      if (key === spec.arrayPath && result[key] != null && !Array.isArray(result[key])) {
        delete result[key];
        continue;
      }
      result[key] = encryptConfigSecrets(result[key], key);
    }
  }

  return result;
}

/**
 * Returns a cloned config value with registered secret values encrypted before
 * writes. `basePath` identifies what `root` is: `''` for a full overrides
 * document, or a section/array field path for a patched value at that path.
 * Empty secrets reset their display companions.
 */
export function encryptConfigSecrets<T>(root: T, basePath = ''): T {
  if (root == null || typeof root !== 'object') {
    return root;
  }

  const result = structuredClone(root);
  if (basePath === '') {
    removeFlatSecretPathKeys(result as Record<string, unknown>);
  }

  for (const spec of SECTION_SECRET_SPECS) {
    const section = getSectionRecord(result, spec, basePath);
    if (section) {
      applySectionSecretWrite(section, spec);
    }
  }

  for (const spec of ARRAY_SECRET_SPECS) {
    removeMalformedSecretContainer(result, spec, basePath);
    const entries = getSecretArray(result, spec, basePath);
    if (entries) {
      applyArraySecretWrites(entries, spec);
    }
  }
  return result;
}

function preserveSectionSecret(
  result: unknown,
  existing: unknown,
  spec: SectionSecretSpec,
  basePath: string,
): void {
  const section = getSectionRecord(result, spec, basePath);
  const existingSection = getSectionRecord(existing, spec);
  if (
    !section ||
    !existingSection ||
    spec.secretKey in section ||
    !isEncryptedConfigSecret(existingSection[spec.secretKey])
  ) {
    return;
  }

  const existingSecret = normalizeSecretString(existingSection[spec.secretKey]);
  if (!existingSecret) {
    return;
  }
  section[spec.secretKey] = existingSecret;
  if (typeof existingSection[spec.displayKey] === 'string') {
    section[spec.displayKey] = existingSection[spec.displayKey];
  }
}

function preserveArraySecrets(
  result: unknown,
  existing: unknown,
  spec: ArraySecretSpec,
  basePath: string,
): void {
  const entries = getSecretArray(result, spec, basePath);
  const existingEntries = getSecretArray(existing, spec);
  if (!entries || !existingEntries) {
    return;
  }

  const duplicateIdentities = new Set<string>();
  const existingByIdentity = new Map<string, Record<string, unknown>>();
  for (const item of existingEntries) {
    const entry = getPlainRecord(item);
    const identity = normalizeSecretString(entry?.[spec.identityKey]);
    if (!entry || !identity) {
      continue;
    }
    if (existingByIdentity.has(identity)) {
      duplicateIdentities.add(identity);
      continue;
    }
    existingByIdentity.set(identity, entry);
  }

  for (const item of entries) {
    const entry = getPlainRecord(item);
    if (!entry || spec.secretKey in entry) {
      continue;
    }
    const identity = normalizeSecretString(entry[spec.identityKey]);
    if (identity && duplicateIdentities.has(identity)) {
      continue;
    }
    const existingEntry = identity ? existingByIdentity.get(identity) : undefined;
    const existingSecret = normalizeSecretString(existingEntry?.[spec.secretKey]);
    if (!existingEntry || !existingSecret) {
      continue;
    }
    if (isEncryptedConfigSecret(existingSecret)) {
      entry[spec.secretKey] = existingSecret;
      if (typeof existingEntry[spec.displayKey] === 'string') {
        entry[spec.displayKey] = existingEntry[spec.displayKey];
      }
      continue;
    }
    if (spec.isPassthroughValue(existingSecret)) {
      continue;
    }
    entry[spec.secretKey] = encryptV3(existingSecret);
    entry[spec.displayKey] = getDisplaySecretKey(existingSecret);
  }
}

/**
 * Preserves existing encrypted secrets when a write omits them, so redacted
 * admin reads round-trip safely: omitting a secret keeps it, while setting it
 * to an empty value clears it. Array-item secrets match entries by their
 * identity field (e.g. a custom endpoint's `name`); `existing` is always the
 * full existing overrides document.
 */
export function preserveConfigSecrets<T>(next: T, existing?: unknown, basePath = ''): T {
  if (
    next == null ||
    typeof next !== 'object' ||
    existing == null ||
    typeof existing !== 'object'
  ) {
    return next;
  }

  const result = structuredClone(next);
  for (const spec of SECTION_SECRET_SPECS) {
    preserveSectionSecret(result, existing, spec, basePath);
  }
  for (const spec of ARRAY_SECRET_SPECS) {
    preserveArraySecrets(result, existing, spec, basePath);
  }
  return result;
}

function shouldRedactSecretValue(value: unknown, spec: ArraySecretSpec): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (isEncryptedConfigSecret(value)) {
    return true;
  }
  const normalized = normalizeSecretString(value);
  return normalized != null && !spec.isPassthroughValue(normalized);
}

/**
 * Deletes registered secret fields from `root` in place so admin reads never
 * return secret values — encrypted or plaintext-legacy. Display companions and
 * readable reference values (`user_provided`, `${ENV_VAR}`) are preserved.
 * The caller passes a cloned object.
 */
export function redactConfigSecrets<T>(root: T): T {
  const rootRecord = getPlainRecord(root);
  if (!rootRecord) {
    return root;
  }
  removeFlatSecretPathKeys(rootRecord);

  for (const spec of SECTION_SECRET_SPECS) {
    const section = getPlainRecord(rootRecord[spec.section]);
    if (section) {
      delete section[spec.secretKey];
    }
  }

  for (const spec of ARRAY_SECRET_SPECS) {
    removeMalformedSecretContainer(rootRecord, spec);
    const entries = getSecretArray(rootRecord, spec);
    if (!entries) {
      continue;
    }
    for (const item of entries) {
      const entry = getPlainRecord(item);
      if (entry && shouldRedactSecretValue(entry[spec.secretKey], spec)) {
        delete entry[spec.secretKey];
      }
    }
  }
  return root;
}
