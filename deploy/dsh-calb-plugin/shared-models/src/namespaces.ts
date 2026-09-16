/** Settings namespaces owned by the platform super admin's model policy. */
export const MODEL_SETTINGS_NAMESPACES = [
  'llm-deepseek',
  'llm-pi-ai',
  'agent-default-model',
  'subagent-model-selection',
] as const

export type ModelSettingsNamespace = typeof MODEL_SETTINGS_NAMESPACES[number]

/** @param ns - settings namespace key from the settings service. */
export function isModelSettingsNamespace(ns: string): ns is ModelSettingsNamespace {
  return (MODEL_SETTINGS_NAMESPACES as readonly string[]).includes(ns)
}

/** Credential refs the Models settings page commonly writes. */
export const MODEL_CREDENTIAL_REFS = [
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'MISTRAL_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'XAI_API_KEY',
  'CEREBRAS_API_KEY',
  'MOONSHOT_API_KEY',
] as const

/** @param ref - credential reference name from the Models page. */
export function isModelCredentialRef(ref: string): boolean {
  return ref.endsWith('_API_KEY') || (MODEL_CREDENTIAL_REFS as readonly string[]).includes(ref)
}
