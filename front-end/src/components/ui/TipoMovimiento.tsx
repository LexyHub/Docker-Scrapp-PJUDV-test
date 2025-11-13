import { cn } from "@/lib/utils";

interface TipoMovimientoProps {
  text: string;
  objKey: string;
  onClick: (key: string | null) => void;
  isActive: boolean;
}

export function TipoMovimiento({
  text,
  objKey,
  onClick,
  isActive,
}: TipoMovimientoProps) {
  return (
    <button
      type='button'
      onClick={() => onClick(objKey)}
      className={cn(
        "px-4 py-1.5 rounded-sm border border-lexy-border-table transition-all cursor-pointer text-sm",
        {
          "bg-neutral-800 text-white": isActive,
          "hover:bg-accent": !isActive,
        }
      )}>
      {text}
    </button>
  );
}
