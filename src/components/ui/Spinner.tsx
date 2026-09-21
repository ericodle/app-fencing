// A drawn ring, not a glow. Matches the house rule: depth comes from geometry.
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-4 animate-spin" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </span>
  )
}

export function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted">
      <Spinner />
    </div>
  )
}
