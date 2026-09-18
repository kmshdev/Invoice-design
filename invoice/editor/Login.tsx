import { NextArrow12Icon as ArrowIcon } from '@oxide/design-system/icons/react'
import { useState } from 'react'

import { request } from '../application/client'
import Field from './Field'

export default function Login() {
  const [registering, setRegistering] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  return (
    <>
      <header className="login-header">
        <a className="app-brand" href="/">
          <span className="brand-symbol" aria-hidden="true">
            [s]
          </span>{' '}
          Shardlane
        </a>
        <a href="/create">Continue as guest ↗</a>
      </header>
      <main id="main" className="login-page">
        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            if (registering && !name.trim()) {
              setError('Enter your name to create an account.')
              return
            }
            if (registering && password.length < 12) {
              setError('Use a password with at least 12 characters.')
              return
            }
            setBusy(true)
            setError('')
            void request(
              registering ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email',
              {
                method: 'POST',
                body: JSON.stringify(
                  registering
                    ? { name: name.trim(), email, password }
                    : { email, password },
                ),
              },
            )
              .then(() => {
                const next = new URLSearchParams(location.search).get('next')
                location.assign(
                  next && /^\/invoices\/[a-zA-Z0-9-]+$/.test(next) ? next : '/workspace',
                )
              })
              .catch((cause: unknown) => {
                setError(cause instanceof Error ? cause.message : 'Unable to sign in.')
                setBusy(false)
              })
          }}
        >
          <div className="login-heading">
            <span className="section-eyebrow">YOUR SHARDLANE WORKSPACE</span>
            <h1>{registering ? 'A fresh start.' : 'Welcome back.'}</h1>
            <p>
              {registering
                ? 'Create an account for your cloud workspace.'
                : 'Sign in to your invoices and saved clients.'}
            </p>
          </div>
          {registering && (
            <Field label="Name">
              <input
                autoComplete="name"
                required
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          )}
          <Field label="Email">
            <input
              type="email"
              autoComplete={registering ? 'email' : 'username'}
              required
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="Password">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={registering ? 'new-password' : 'current-password'}
              minLength={registering ? 12 : undefined}
              required
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <label className="password-option">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            Show password
          </label>
          {error && (
            <p className="source-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy} type="submit">
            <ArrowIcon aria-hidden="true" />
            {busy
              ? registering
                ? 'Creating account…'
                : 'Signing in…'
              : registering
                ? 'Create account'
                : 'Sign in'}
          </button>
          <button
            className="button secondary"
            disabled={busy}
            type="button"
            onClick={() => {
              setRegistering(!registering)
              setError('')
            }}
          >
            {registering ? 'I already have an account' : 'Create an account'}
          </button>
          <div className="login-divider">OR</div>
          <a href="/create">Continue as guest ↗</a>
        </form>
      </main>
    </>
  )
}
