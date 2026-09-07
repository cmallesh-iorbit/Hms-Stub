import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { UnauthorizedError } from '../api/client'

export interface PickerItem {
  id: string
  title: string
  subtitle: string
}

interface Props {
  label: string
  placeholder: string
  /** Runs on a debounce; an empty query should return a sensible default list. */
  search: (query: string) => Promise<PickerItem[]>
  selected: PickerItem | null
  onSelect: (item: PickerItem | null) => void
  required?: boolean
  error?: string
  hint?: string
}

const DEBOUNCE_MS = 300

/**
 * Search-and-select for a FHIR resource.
 *
 * Appointments are built almost entirely from references, so the user has to pick an
 * existing Patient and Practitioner rather than type a name. Kept generic so one
 * component serves both.
 */
export function ResourcePicker({
  label,
  placeholder,
  search,
  selected,
  onSelect,
  required,
  error,
  hint,
}: Props) {
  const inputId = useId()
  const listId = useId()

  const [query, setQuery] = useState('')
  const [items, setItems] = useState<PickerItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState(-1)

  const containerRef = useRef<HTMLDivElement>(null)
  // Guards against an earlier, slower search overwriting a later one's results.
  const requestSeq = useRef(0)

  const runSearch = useCallback(
    async (q: string) => {
      const seq = ++requestSeq.current
      setLoading(true)
      setSearchError(null)

      try {
        const results = await search(q)
        if (seq !== requestSeq.current) return
        setItems(results)
        setHighlighted(results.length > 0 ? 0 : -1)
      } catch (err) {
        if (seq !== requestSeq.current) return
        // A dead session is handled globally by the API client; no point showing
        // "search failed" while the app is already redirecting to /login.
        if (err instanceof UnauthorizedError) return
        setItems([])
        setSearchError(err instanceof Error ? err.message : 'Search failed.')
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    },
    [search],
  )

  // Debounced search whenever the box is open and the text changes.
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => void runSearch(query), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query, open, runSearch])

  // Close on an outside click.
  useEffect(() => {
    if (!open) return

    function onDocumentClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [open])

  function choose(item: PickerItem) {
    onSelect(item)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setHighlighted((current) => {
        if (items.length === 0) return -1
        const delta = event.key === 'ArrowDown' ? 1 : -1
        return (current + delta + items.length) % items.length
      })
      return
    }

    if (event.key === 'Enter') {
      if (open && highlighted >= 0 && items[highlighted]) {
        event.preventDefault()
        choose(items[highlighted])
      }
      return
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  if (selected) {
    return (
      <div className={`field${error ? ' field--invalid' : ''}`} ref={containerRef}>
        <label className="field__label" htmlFor={inputId}>
          {label}
          {required && (
            <span className="field__required" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>

        <div className="picker__chosen">
          <div className="picker__chosen-text">
            <span className="picker__chosen-title">{selected.title}</span>
            {selected.subtitle && (
              <span className="picker__chosen-subtitle">{selected.subtitle}</span>
            )}
          </div>
          <button type="button" className="btn btn--link" onClick={() => onSelect(null)}>
            Change
          </button>
        </div>

        {error && <p className="field__error">{error}</p>}
      </div>
    )
  }

  return (
    <div className={`field${error ? ' field--invalid' : ''}`} ref={containerRef}>
      <label className="field__label" htmlFor={inputId}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>

      <div className="picker">
        <input
          id={inputId}
          className="input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />

        {open && (
          <ul className="picker__list" id={listId} role="listbox">
            {loading && <li className="picker__status">Searching…</li>}

            {!loading && searchError && (
              <li className="picker__status picker__status--error">{searchError}</li>
            )}

            {!loading && !searchError && items.length === 0 && (
              <li className="picker__status">
                {query.trim() ? 'No matches. Try fewer letters.' : 'No records found.'}
              </li>
            )}

            {!loading &&
              !searchError &&
              items.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlighted}
                    className={`picker__option${index === highlighted ? ' is-highlighted' : ''}`}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => choose(item)}
                  >
                    <span className="picker__option-title">{item.title}</span>
                    {item.subtitle && (
                      <span className="picker__option-subtitle">{item.subtitle}</span>
                    )}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && <p className="field__error">{error}</p>}
    </div>
  )
}
