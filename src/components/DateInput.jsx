function parseDatePaste(raw) {
  const s = raw.trim().replace(/\s/g, '');
  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY, D/M/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD/MM/YY
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? (parseInt(y) < 50 ? '20' + y : '19' + y) : y;
    return `${year.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

export default function DateInput({ value, onChange, ...props }) {
  function handlePaste(e) {
    const raw = e.clipboardData.getData('text');
    const iso = parseDatePaste(raw);
    if (iso) {
      e.preventDefault();
      onChange?.({ target: { value: iso } });
    }
  }

  return (
    <input
      type="date"
      value={value}
      onChange={onChange}
      onPaste={handlePaste}
      {...props}
    />
  );
}
