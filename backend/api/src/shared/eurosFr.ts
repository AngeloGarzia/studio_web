const UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize"
];

function frUnder100(n: number): string {
  if (n < 17) return UNITS[n] ?? "";
  if (n < 20) return `dix-${frUnder100(n - 10)}`;
  if (n < 70) {
    const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];
    const t = Math.floor(n / 10);
    const u = n % 10;
    const name = tens[t] ?? "";
    if (u === 0) return name;
    if (u === 1) return `${name} et un`;
    return `${name}-${frUnder100(u)}`;
  }
  if (n < 80) {
    if (n === 71) return "soixante et onze";
    return `soixante-${frUnder100(n - 60)}`;
  }
  if (n === 80) return "quatre-vingts";
  return `quatre-vingt-${frUnder100(n - 80)}`;
}

function frUnder1000(n: number): string {
  if (n < 100) return frUnder100(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const cent = hundreds === 1 ? "cent" : `${frUnder100(hundreds)} ${rest === 0 ? "cents" : "cent"}`;
  if (rest === 0) return cent;
  return `${cent} ${frUnder100(rest)}`;
}

function frInt(n: number): string {
  if (n < 1000) return frUnder1000(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const mil = thousands === 1 ? "mille" : `${frUnder1000(thousands)} mille`;
  if (rest === 0) return mil;
  return `${mil} ${frUnder1000(rest)}`;
}

export function eurosToLetters(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const centimes = abs % 100;
  const euroWord = euros > 1 || euros === 0 ? "euros" : "euro";
  let text = `${frInt(euros)} ${euroWord}`;
  if (centimes > 0) {
    text += ` et ${frInt(centimes)} ${centimes > 1 ? "centimes" : "centime"}`;
  }
  return text;
}

export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatYmdLong(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
