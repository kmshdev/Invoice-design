import type { ValidationIssue } from '../model'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: ValidationIssue[],
  ) {
    super(message)
  }
}
export function conflict() {
  return new HttpError(
    409,
    'This invoice has changed. Reload its latest revision before continuing.',
  )
}
