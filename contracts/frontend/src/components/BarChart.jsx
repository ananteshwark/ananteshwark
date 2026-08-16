// Lightweight dependency-free horizontal bar chart (CSS bars).
export default function BarChart({ data, valueKey = 'value', labelKey = 'label', format }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0))
  const fmt = format || ((v) => v)
  return (
    <div className="barchart">
      {data.map((d, i) => {
        const v = Number(d[valueKey]) || 0
        return (
          <div className="barrow" key={i}>
            <div className="barlabel" title={d[labelKey]}>{d[labelKey]}</div>
            <div className="bartrack">
              <div className="barfill" style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <div className="barvalue">{fmt(v)}</div>
          </div>
        )
      })}
      {data.length === 0 && <p className="hint">No data.</p>}
    </div>
  )
}
