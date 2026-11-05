export default function MedianIndicator({ score, median, position, season }: { score: number; median?: number; position: string; season: number }) {
  if (median === undefined || !Number.isFinite(median) || !Number.isFinite(score) || score === median) return null;
  const above = score > median;
  const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const benchmark = position === "OF" ? "OF3" : position === "SP" ? "SP4" : position;
  const label = `Primary POS: ${position} · ${above ? "Above" : "Below"} the ${benchmark} league median · ${season}: ${number.format(score)} fantasy points vs ${number.format(median)} median (${above ? "+" : ""}${number.format(score - median)}).`;
  return <span role="img" aria-label={label} title={label} className={`inline-flex shrink-0 items-center ${above ? "text-emerald-600/70 dark:text-emerald-400/70" : "text-rose-500/60 dark:text-rose-400/60"}`}>
    <svg aria-hidden="true" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={above ? "M3 7.5 6 4.5 9 7.5" : "M3 4.5 6 7.5 9 4.5"} /></svg>
  </span>;
}
