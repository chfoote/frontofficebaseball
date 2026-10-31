type InjuryDesignation = "IR" | "LTIR";

function getDesignation(position?: string | null): InjuryDesignation | null {
  const designation = position?.trim().toUpperCase();
  return designation === "IR" || designation === "LTIR" ? designation : null;
}

export default function InjuryDesignationBadge({
  position,
  className = "",
}: {
  position?: string | null;
  className?: string;
}) {
  const designation = getDesignation(position);
  if (!designation) return null;

  const isLongTerm = designation === "LTIR";
  const label = isLongTerm ? "Long-Term Injured Reserve" : "Injured Reserve";
  const styles = isLongTerm
    ? "bg-error-50 text-error-700 ring-error-200 dark:bg-error-500/10 dark:text-error-300 dark:ring-error-500/30"
    : "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/30";

  return (
    <span
      aria-label={`${label} — GLDHL roster designation`}
      title={`${label} — GLDHL roster designation`}
      className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 align-middle text-[10px] font-black uppercase tracking-wide ring-1 ${styles} ${className}`}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3 fill-current">
        <path d="M10 17.1 8.8 16C4.4 12 1.5 9.4 1.5 6.2 1.5 3.6 3.5 1.7 6.1 1.7c1.5 0 2.9.7 3.9 1.8 1-1.1 2.4-1.8 3.9-1.8 2.6 0 4.6 1.9 4.6 4.5 0 3.2-2.9 5.8-7.3 9.8L10 17.1Z" />
      </svg>
      {designation}
    </span>
  );
}
