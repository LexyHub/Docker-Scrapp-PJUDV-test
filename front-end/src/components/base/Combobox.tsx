import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/base/Command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/base/Popover";

interface Props {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  empty?: string;
  disabled?: boolean;
  className?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  empty,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger disabled={disabled} asChild>
        <button
          role='combobox'
          aria-expanded={open}
          className={cn(
            "w-full flex items-center justify-between border border-lexy-input-border rounded-sm outline-none px-3 py-1 shadow-lexy-button-sm transition-all min-h-8 cursor-pointer",
            className,
            {
              "border-lexy-brand-primary": open,
              "bg-lexy-input-bg-disabled cursor-not-allowed": disabled,
            }
          )}>
          {value
            ? options.find((option) => option.value === value)?.label
            : placeholder || "Selecciona una opción..."}
          <ChevronsUpDown className='opacity-50' />
        </button>
      </PopoverTrigger>
      <PopoverContent className='p-0 min-w-(--radix-popover-trigger-width) w-(--radix-popover-trigger-width)'>
        <Command>
          <CommandInput
            placeholder={placeholder || "Selecciona una opción..."}
            className='h-9'
          />
          <CommandList>
            <CommandEmpty>
              {empty || "No se ha encontrado ningún valor."}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(currentValue) => {
                    onChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                  className='cursor-pointer'>
                  {option.label}
                  <Check
                    className={cn(
                      "ml-auto",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
