import React from "react";

/** `08102026` ou `08/10/2026` → `08/10/2026`. */
function withSlashes(digits: string): string {
  const value = digits.slice(0, 8);
  if (value.length <= 2) return value;
  if (value.length <= 4) return `${value.slice(0, 2)}/${value.slice(2)}`;
  return `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
}

/** `2026-10-08` → `08/10/2026`. */
export function ymdToJjmmaaaa(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** `08102026` → `2026-10-08`, ou null si la date n’existe pas. */
export function jjmmaaaaToYmd(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!/^\d{8}$/.test(digits)) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

export function DateField({
  id,
  value,
  onChange,
  disabled,
  className
}: {
  id?: string;
  /** Date `AAAA-MM-JJ`, ou chaîne vide. */
  value: string;
  onChange: (ymd: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [text, setText] = React.useState(() => ymdToJjmmaaaa(value));
  const focused = React.useRef(false);

  React.useEffect(() => {
    if (!focused.current) setText(ymdToJjmmaaaa(value));
  }, [value]);

  return (
    <input
      id={id}
      className={className}
      inputMode="numeric"
      autoComplete="off"
      placeholder="jj/mm/aaaa"
      maxLength={10}
      disabled={disabled}
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        if (text.length === 0) {
          if (value) onChange("");
          return;
        }
        const ymd = jjmmaaaaToYmd(text);
        if (!ymd) {
          setText(ymdToJjmmaaaa(value));
          return;
        }
        if (ymd !== value) onChange(ymd);
        setText(ymdToJjmmaaaa(ymd));
      }}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, 8);
        setText(withSlashes(digits));
        if (digits.length === 0) onChange("");
        else if (digits.length === 8) {
          const ymd = jjmmaaaaToYmd(digits);
          if (ymd) onChange(ymd);
        }
      }}
    />
  );
}
