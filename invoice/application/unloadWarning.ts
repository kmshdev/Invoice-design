let suppressed = false

export function suppressUnloadWarning() {
  suppressed = true
}

export function shouldWarnBeforeUnload() {
  return !suppressed
}
