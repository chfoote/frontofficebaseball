const countryCodes: Record<string, { alpha2: string; name: string }> = {
  AUS: { alpha2: "AU", name: "Australia" },
  AUT: { alpha2: "AT", name: "Austria" },
  BLR: { alpha2: "BY", name: "Belarus" },
  CAN: { alpha2: "CA", name: "Canada" },
  CHE: { alpha2: "CH", name: "Switzerland" },
  CHN: { alpha2: "CN", name: "China" },
  CZE: { alpha2: "CZ", name: "Czechia" },
  DEU: { alpha2: "DE", name: "Germany" },
  DNK: { alpha2: "DK", name: "Denmark" },
  FIN: { alpha2: "FI", name: "Finland" },
  FRA: { alpha2: "FR", name: "France" },
  GBR: { alpha2: "GB", name: "United Kingdom" },
  HRV: { alpha2: "HR", name: "Croatia" },
  HUN: { alpha2: "HU", name: "Hungary" },
  ITA: { alpha2: "IT", name: "Italy" },
  JPN: { alpha2: "JP", name: "Japan" },
  KAZ: { alpha2: "KZ", name: "Kazakhstan" },
  KOR: { alpha2: "KR", name: "South Korea" },
  LVA: { alpha2: "LV", name: "Latvia" },
  NLD: { alpha2: "NL", name: "Netherlands" },
  NOR: { alpha2: "NO", name: "Norway" },
  POL: { alpha2: "PL", name: "Poland" },
  RUS: { alpha2: "RU", name: "Russia" },
  SVK: { alpha2: "SK", name: "Slovakia" },
  SVN: { alpha2: "SI", name: "Slovenia" },
  SWE: { alpha2: "SE", name: "Sweden" },
  UKR: { alpha2: "UA", name: "Ukraine" },
  USA: { alpha2: "US", name: "United States" },
};

function flagEmoji(alpha2: string) {
  return [...alpha2].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
}

export default function CountryFlagBadge({
  countryCode,
  showName = false,
  className = "",
}: {
  countryCode?: string | null;
  showName?: boolean;
  className?: string;
}) {
  if (!countryCode) return null;
  const normalizedCode = countryCode.trim().toUpperCase();
  const country = countryCodes[normalizedCode];
  const name = country?.name || normalizedCode;

  return (
    <span
      title={`Born in ${name}`}
      aria-label={`Born in ${name}`}
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900/90 dark:text-gray-300 dark:ring-gray-700 ${className}`}
    >
      <span aria-hidden="true" className="text-sm leading-none">{country ? flagEmoji(country.alpha2) : "🌐"}</span>
      {showName && <span>{name}</span>}
    </span>
  );
}
