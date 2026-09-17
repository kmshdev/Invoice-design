import { NextArrow12Icon as ArrowIcon } from '@oxide/design-system/icons/react'
import { useState } from 'react'

import { request } from '../application/client'
import Field from './Field'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <main className="login-page">
      <form
        className="login-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          setError('')
          void request('/api/auth/sign-in/email', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          })
            .then(() => {
              const next = new URLSearchParams(location.search).get('next')
              location.assign(next && /^\/invoices\/[a-zA-Z0-9-]+$/.test(next) ? next : '/')
            })
            .catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : 'Unable to sign in.')
              setBusy(false)
            })
        }}
      >
        <h1>Invoice Studio</h1>
        <h2>Sign in</h2>
        <Field label="Email">
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {error && (
          <p className="source-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy} type="submit">
          <ArrowIcon aria-hidden="true" />
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <a href="/template-preview">Template preview</a>
      </form>
    </main>
  )
}
