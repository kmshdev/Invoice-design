import type { Party, ValidationIssue } from '../model'
import Field from './Field'

export default function PartyEditor({
  party,
  onChange,
  issues,
  prefix,
}: {
  party: Party
  onChange: (party: Party) => void
  issues: ValidationIssue[]
  prefix: string
}) {
  const address = party.address
  return (
    <div className="field-stack">
      <Field label="Business name">
        <input
          value={party.name}
          onChange={(event) => onChange({ ...party, name: event.target.value })}
        />
      </Field>
      {typeof address === 'string' ? (
        <Field label="Address (original text)">
          <textarea
            rows={3}
            value={address}
            onChange={(event) => onChange({ ...party, address: event.target.value })}
          />
        </Field>
      ) : (
        (['line1', 'line2', 'region', 'country', 'postalCode'] as const).map((key) => (
          <Field
            key={key}
            label={
              {
                line1: 'Street / building',
                line2: 'Locality / city',
                region: 'State / region',
                country: 'Country',
                postalCode: 'PIN / postal code',
              }[key]
            }
          >
            <input
              value={address[key]}
              onChange={(event) =>
                onChange({ ...party, address: { ...address, [key]: event.target.value } })
              }
            />
          </Field>
        ))
      )}
      <Field label="Tax identity type">
        <select
          value={party.taxIdType ?? 'generic'}
          onChange={(event) =>
            onChange({ ...party, taxIdType: event.target.value as Party['taxIdType'] })
          }
        >
          <option value="generic">Generic / international</option>
          <option value="gstin">Indian GSTIN</option>
          <option value="uae-trn">UAE TRN</option>
        </select>
      </Field>
      <Field label="Tax ID label">
        <input
          value={party.taxIdLabel ?? ''}
          onChange={(event) => onChange({ ...party, taxIdLabel: event.target.value })}
        />
      </Field>
      <Field
        label="Tax ID value"
        error={issues.find((issue) => issue.path === `${prefix}.taxId`)?.message}
      >
        <input
          value={party.taxId}
          onChange={(event) => onChange({ ...party, taxId: event.target.value })}
        />
      </Field>
      <Field
        label="Separate TAXID (PAN)"
        error={issues.find((issue) => issue.path === `${prefix}.pan`)?.message}
      >
        <input
          value={party.pan ?? ''}
          onChange={(event) => onChange({ ...party, pan: event.target.value })}
        />
      </Field>
      <Field label="PAN label">
        <input
          value={party.panLabel ?? ''}
          onChange={(event) => onChange({ ...party, panLabel: event.target.value })}
        />
      </Field>
    </div>
  )
}
