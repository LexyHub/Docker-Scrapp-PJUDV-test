import { cn } from "@/lib/utils";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full border border-lexy-input-border rounded-sm outline-none px-3 py-1 shadow-lexy-button-sm focus:border-lexy-brand-primary transition-all min-h-8",
        props.className
      )}
    />
  );
}
