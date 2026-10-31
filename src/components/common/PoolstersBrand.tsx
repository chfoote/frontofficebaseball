type PoolstersBrandProps = { className?: string };

export default function PoolstersBrand({ className = "" }: PoolstersBrandProps) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="flex h-28 w-48 items-center justify-center overflow-hidden rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200 dark:ring-white/15">
        <img src="/poolsters-logo.png" alt="Poolsters" className="h-full w-full object-contain" />
      </div>
      <span className="mt-3 text-[9px] font-black uppercase tracking-[0.28em] text-slate-400">Dynasty Baseball League</span>
    </div>
  );
}
