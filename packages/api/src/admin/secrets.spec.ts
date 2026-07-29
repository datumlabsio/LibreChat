process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Loaded via dynamic import in beforeAll so encryption initializes after
// CREDS_KEY is set above (encryptV3 reads the key at module load).
let decryptConfigSecret: typeof import('./secrets').decryptConfigSecret;
let encryptConfigSecretFields: typeof import('./secrets').encryptConfigSecretFields;
let encryptConfigSecrets: typeof import('./secrets').encryptConfigSecrets;
let getConfigSecretInputError: typeof import('./secrets').getConfigSecretInputError;
let preserveConfigSecrets: typeof import('./secrets').preserveConfigSecrets;
let redactConfigSecrets: typeof import('./secrets').redactConfigSecrets;
let resolveConfigSecretValue: typeof import('./secrets').resolveConfigSecretValue;
let resolveCustomEndpointSecrets: typeof import('./secrets').resolveCustomEndpointSecrets;
let decryptV3: typeof import('@librechat/data-schemas').decryptV3;

beforeAll(async () => {
  ({
    decryptConfigSecret,
    encryptConfigSecretFields,
    encryptConfigSecrets,
    getConfigSecretInputError,
    preserveConfigSecrets,
    redactConfigSecrets,
    resolveConfigSecretValue,
    resolveCustomEndpointSecrets,
  } = await import('./secrets'));
  ({ decryptV3 } = await import('@librechat/data-schemas'));
});

describe('Langfuse config secrets', () => {
  it('encrypts direct field writes and stores a display secret key', () => {
    const out = encryptConfigSecretFields({
      'langfuse.publicKey': 'pk-lf-1',
      'langfuse.secretKey': 'sk-lf-secret',
    });

    expect(out['langfuse.secretKey']).toMatch(/^v3:/);
    expect(decryptV3(out['langfuse.secretKey'] as string)).toBe('sk-lf-secret');
    expect(out['langfuse.displaySecretKey']).toBe('sk-lf-...cret');
    expect(out['langfuse.publicKey']).toBe('pk-lf-1');
  });

  it('encrypts object writes and removes client-supplied display secret keys', () => {
    const out = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-lf-1',
        secretKey: 'sk-lf-secret',
        displaySecretKey: 'spoofed',
      },
    });

    expect(out.langfuse.secretKey).toMatch(/^v3:/);
    expect(decryptV3(out.langfuse.secretKey)).toBe('sk-lf-secret');
    expect(out.langfuse.displaySecretKey).toBe('sk-lf-...cret');
    expect(out.langfuse.publicKey).toBe('pk-lf-1');
  });

  it('clears empty or non-string secret values', () => {
    expect(encryptConfigSecretFields({ 'langfuse.secretKey': '' })).toEqual({
      'langfuse.secretKey': '',
      'langfuse.displaySecretKey': '',
    });

    expect(
      encryptConfigSecrets({
        langfuse: {
          secretKey: null,
          displaySecretKey: 'spoofed',
        },
      }),
    ).toEqual({
      langfuse: {
        secretKey: '',
        displaySecretKey: '',
      },
    });
  });

  it('rejects protected display-key writes and encrypted secret submissions', () => {
    expect(getConfigSecretInputError('langfuse.displaySecretKey', 'spoofed')).toContain(
      'protected display secret path',
    );
    expect(getConfigSecretInputError('langfuse.secretKey', 'v3:attacker-controlled')).toContain(
      'Encrypted config secret values',
    );
    expect(
      getConfigSecretInputError('langfuse', { secretKey: 'v3:attacker-controlled' }),
    ).toContain('Encrypted config secret values');
    expect(getConfigSecretInputError('langfuse.secretKey', 'sk-lf-secret')).toBeNull();
  });

  it('decrypts encrypted config secrets and rejects plaintext runtime values', () => {
    const encrypted = encryptConfigSecrets({
      langfuse: { secretKey: 'sk-lf-secret' },
    }).langfuse.secretKey;

    expect(decryptConfigSecret(encrypted)).toBe('sk-lf-secret');
    expect(decryptConfigSecret(' sk-plaintext ')).toBeUndefined();
    expect(decryptConfigSecret('')).toBeUndefined();
    expect(decryptConfigSecret('v3:not-valid-ciphertext')).toBeUndefined();
  });

  it('preserves existing encrypted secrets when object writes omit them', () => {
    const existing = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-old',
        secretKey: 'sk-old',
      },
    });
    const next = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-new',
      },
    });

    const preserved = preserveConfigSecrets(next, existing);
    const preservedLangfuse = preserved.langfuse as Record<string, string>;
    const existingLangfuse = existing.langfuse as Record<string, string>;

    expect(decryptV3(preservedLangfuse.secretKey)).toBe('sk-old');
    expect(preservedLangfuse.displaySecretKey).toBe(existingLangfuse.displaySecretKey);
    expect(preserved.langfuse.publicKey).toBe('pk-new');
  });

  it('does not preserve plaintext existing secrets or explicitly cleared secrets', () => {
    const next = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-new',
      },
    });

    const fromPlaintext = preserveConfigSecrets(next, {
      langfuse: {
        publicKey: 'pk-old',
        secretKey: 'sk-plain-existing',
      },
    });
    expect(fromPlaintext.langfuse).toEqual({ publicKey: 'pk-new' });

    const existing = encryptConfigSecrets({
      langfuse: {
        secretKey: 'sk-old',
      },
    });
    const cleared = encryptConfigSecrets({
      langfuse: {
        secretKey: '',
      },
    });
    expect(preserveConfigSecrets(cleared, existing)).toEqual({
      langfuse: {
        secretKey: '',
        displaySecretKey: '',
      },
    });
  });

  it('preserves existing secrets for object-valued ancestor patches', () => {
    const existing = encryptConfigSecrets({
      langfuse: {
        publicKey: 'pk-old',
        secretKey: 'sk-old',
      },
    });

    const preserved = preserveConfigSecrets({ publicKey: 'pk-new' }, existing, 'langfuse');
    const preservedLangfuse = preserved as Record<string, string>;
    const existingLangfuse = existing.langfuse as Record<string, string>;

    expect(decryptV3(preservedLangfuse.secretKey)).toBe('sk-old');
    expect(preservedLangfuse.displaySecretKey).toBe(existingLangfuse.displaySecretKey);
    expect(preserved.publicKey).toBe('pk-new');
  });

  it('redacts secret values while preserving display secret keys', () => {
    const redacted = redactConfigSecrets({
      'langfuse.secretKey': 'literal',
      'langfuse.displaySecretKey': 'literal-display',
      langfuse: {
        enabled: true,
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKey: 'v3:abc:def',
        displaySecretKey: 'sk-lf-...cret',
      },
    });

    expect(redacted['langfuse.secretKey']).toBeUndefined();
    expect(redacted['langfuse.displaySecretKey']).toBeUndefined();
    expect(redacted.langfuse).toEqual({
      enabled: true,
      destination: 'eu',
      publicKey: 'pk-lf-1',
      displaySecretKey: 'sk-lf-...cret',
    });
  });
});

describe('Custom endpoint config secrets', () => {
  const endpointsWith = (custom: Array<Record<string, unknown>>) => ({ endpoints: { custom } });

  it('encrypts literal API keys on full-document writes and stores display companions', () => {
    const out = encryptConfigSecrets(
      endpointsWith([
        { name: 'OpenRouter', apiKey: 'sk-or-super-secret', baseURL: 'https://openrouter.ai' },
      ]),
    );
    const entry = out.endpoints.custom[0] as Record<string, string>;

    expect(entry.apiKey).toMatch(/^v3:/);
    expect(decryptV3(entry.apiKey)).toBe('sk-or-super-secret');
    expect(entry.displayApiKey).toBe('sk-or-...cret');
    expect(entry.baseURL).toBe('https://openrouter.ai');
  });

  it('leaves user_provided and env-reference API keys readable', () => {
    const out = encryptConfigSecrets(
      endpointsWith([
        { name: 'A', apiKey: 'user_provided', displayApiKey: 'spoofed' },
        { name: 'B', apiKey: '${OPENROUTER_KEY}' },
      ]),
    );
    const [a, b] = out.endpoints.custom as Array<Record<string, string>>;

    expect(a.apiKey).toBe('user_provided');
    expect(a.displayApiKey).toBeUndefined();
    expect(b.apiKey).toBe('${OPENROUTER_KEY}');
    expect(b.displayApiKey).toBeUndefined();
  });

  it('encrypts section and array patched values from field maps', () => {
    const viaSection = encryptConfigSecretFields({
      endpoints: { custom: [{ name: 'A', apiKey: 'sk-section-key' }] },
    });
    const sectionEntry = (viaSection.endpoints as { custom: Array<Record<string, string>> })
      .custom[0];
    expect(decryptV3(sectionEntry.apiKey)).toBe('sk-section-key');
    expect(sectionEntry.displayApiKey).toBe('sk-sec...-key');

    const viaArray = encryptConfigSecretFields({
      'endpoints.custom': [{ name: 'A', apiKey: 'sk-array-key0' }],
    });
    const arrayEntry = (viaArray['endpoints.custom'] as Array<Record<string, string>>)[0];
    expect(decryptV3(arrayEntry.apiKey)).toBe('sk-array-key0');
    expect(arrayEntry.displayApiKey).toBe('sk-arr...key0');
  });

  it('clears empty, non-string, or pre-encrypted API key submissions', () => {
    const out = encryptConfigSecrets(
      endpointsWith([
        { name: 'A', apiKey: '' },
        { name: 'B', apiKey: null },
        { name: 'C', apiKey: 'v3:smuggled', displayApiKey: 'spoofed' },
      ]),
    );

    for (const item of out.endpoints.custom as Array<Record<string, string>>) {
      expect(item.apiKey).toBe('');
      expect(item.displayApiKey).toBe('');
    }
  });

  it('rejects encrypted submissions and indexed secret writes', () => {
    expect(
      getConfigSecretInputError('endpoints', { custom: [{ name: 'A', apiKey: 'v3:smuggled' }] }),
    ).toContain('Encrypted config secret values');
    expect(
      getConfigSecretInputError('endpoints.custom', [{ name: 'A', apiKey: 'v3:smuggled' }]),
    ).toContain('Encrypted config secret values');
    expect(getConfigSecretInputError('endpoints', [])).toContain('secret ancestor as an array');
    expect(getConfigSecretInputError('endpoints.custom.0.apiKey', 'sk-new')).toContain(
      'Cannot write secret fields by array index',
    );
    expect(getConfigSecretInputError('endpoints.custom.0.displayApiKey', undefined)).toContain(
      'Cannot write secret fields by array index',
    );
    expect(
      getConfigSecretInputError('endpoints.custom.0', { name: 'A', apiKey: 'sk-new' }),
    ).toContain('Cannot write secret fields by array index');
    expect(getConfigSecretInputError('endpoints.custom.0.baseURL', 'https://x')).toBeNull();
    expect(
      getConfigSecretInputError('endpoints.custom', [{ name: 'A', apiKey: 'sk-plain' }]),
    ).toBeNull();
  });

  it('preserves omitted API keys by endpoint name across redacted round-trips', () => {
    const existing = encryptConfigSecrets(
      endpointsWith([
        { name: 'OpenRouter', apiKey: 'sk-or-old-secret' },
        { name: 'Renamed', apiKey: 'sk-renamed-1234' },
      ]),
    );

    const next = encryptConfigSecrets(
      endpointsWith([
        { name: 'OpenRouter', baseURL: 'https://openrouter.ai' },
        { name: 'BrandNew', baseURL: 'https://new.example' },
      ]),
    );
    const preserved = preserveConfigSecrets(next, existing);
    const [openRouter, brandNew] = preserved.endpoints.custom as Array<Record<string, string>>;

    expect(decryptV3(openRouter.apiKey)).toBe('sk-or-old-secret');
    expect(openRouter.displayApiKey).toBe('sk-or-...cret');
    expect(brandNew.apiKey).toBeUndefined();
  });

  it('preserves omitted API keys for array-valued patches, not cleared ones', () => {
    const existing = encryptConfigSecrets(endpointsWith([{ name: 'A', apiKey: 'sk-old-value' }]));

    const kept = preserveConfigSecrets(
      [{ name: 'A', baseURL: 'https://a.example' }],
      existing,
      'endpoints.custom',
    ) as Array<Record<string, string>>;
    expect(decryptV3(kept[0].apiKey)).toBe('sk-old-value');

    const cleared = preserveConfigSecrets(
      encryptConfigSecrets([{ name: 'A', apiKey: '' }], 'endpoints.custom'),
      existing,
      'endpoints.custom',
    ) as Array<Record<string, string>>;
    expect(cleared[0].apiKey).toBe('');
    expect(cleared[0].displayApiKey).toBe('');
  });

  it('redacts encrypted and plaintext-legacy keys while keeping readable references', () => {
    const redacted = redactConfigSecrets({
      endpoints: {
        custom: [
          { name: 'A', apiKey: 'v3:abc:def', displayApiKey: 'sk-a...key' },
          { name: 'B', apiKey: 'sk-plaintext-legacy' },
          { name: 'C', apiKey: 'user_provided' },
          { name: 'D', apiKey: '${OPENROUTER_KEY}' },
          { name: 'E', apiKey: '' },
        ],
      },
    });
    const [a, b, c, d, e] = redacted.endpoints.custom as Array<Record<string, string>>;

    expect(a.apiKey).toBeUndefined();
    expect(a.displayApiKey).toBe('sk-a...key');
    expect(b.apiKey).toBeUndefined();
    expect(c.apiKey).toBe('user_provided');
    expect(d.apiKey).toBe('${OPENROUTER_KEY}');
    expect(e.apiKey).toBe('');
  });

  it('resolves stored values for runtime use', () => {
    const encrypted = encryptConfigSecrets(endpointsWith([{ name: 'A', apiKey: 'sk-runtime' }]))
      .endpoints.custom[0] as Record<string, string>;

    expect(resolveConfigSecretValue(encrypted.apiKey)).toBe('sk-runtime');
    expect(resolveConfigSecretValue('sk-plain')).toBe('sk-plain');
    expect(resolveConfigSecretValue('${OPENROUTER_KEY}')).toBe('${OPENROUTER_KEY}');
    expect(resolveConfigSecretValue('v3:not-valid-ciphertext')).toBe('');

    const resolved = resolveCustomEndpointSecrets({ name: 'A', apiKey: encrypted.apiKey });
    expect(resolved.apiKey).toBe('sk-runtime');
    const passthrough = { name: 'B', apiKey: 'user_provided' };
    expect(resolveCustomEndpointSecrets(passthrough)).toBe(passthrough);
  });
});
