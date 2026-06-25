type TranslateFunction = (key: string, options?: { defaultValue?: string }) => string

export function generationParamLabel(
  param: { key: string; label?: string },
  t: TranslateFunction,
): string {
  const explicitKey = param.label?.includes('.') ? param.label : ''
  if (explicitKey) {
    const translated = t(explicitKey, { defaultValue: '' })
    if (translated) return translated
  }
  return t(`admin.params.templates.${param.key}`, { defaultValue: param.label || param.key })
}

export function generationSlotLabel(
  slot: { key: string; label: string },
  t: TranslateFunction,
): string {
  const explicitKey = slot.label?.includes('.') ? slot.label : ''
  if (explicitKey) {
    const translated = t(explicitKey, { defaultValue: '' })
    if (translated) return translated
  }
  return t(`shared.genInput.slots.${slot.key}`, { defaultValue: slot.label || slot.key })
}
