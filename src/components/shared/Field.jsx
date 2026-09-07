export function Field({ label, style, children }) {
  return (
    <div style={style}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

export function Select({ value, onChange, children, style, ...rest }) {
  return (
    <select value={value} onChange={onChange} className="field-control" style={{ width: '100%', ...style }} {...rest}>
      {children}
    </select>
  );
}
