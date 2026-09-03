// Lightweight loading placeholders. A shimmering block stands in for content
// that's still loading so a page reads as "loading" rather than "empty/broken"
// on slower offline hardware.

export function Skeleton({ width = '100%', height = 14, style = {} }) {
  return <span className="skeleton" style={{ width, height, ...style }} aria-hidden="true" />
}

/** A skeleton table body: `rows` × `cols` shimmering cells. */
export function TableSkeleton({ rows = 8, cols = 5 }) {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c}><Skeleton width={c === 0 ? '40%' : '75%'} /></td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

/** A block of skeleton lines, for card/summary regions. */
export function TextSkeleton({ lines = 3 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={`${90 - i * 12}%`} style={{ display: 'block', marginBottom: 8 }} />
      ))}
    </div>
  )
}
