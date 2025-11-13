import { ExternalLink } from "lucide-react";
import type { Document, Anexo } from "@/types/data.type";
import { cn } from "@/lib/utils";

interface CellValueProps {
  value: unknown;
}

// Detecta si es Document
function isDocument(v: unknown): v is Document {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.url === "string" && typeof obj.name === "string";
}

function isAnexo(v: unknown): v is Anexo {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    Array.isArray(obj.doc) &&
    typeof obj.fecha === "string" &&
    typeof obj.referencia === "string"
  );
}

export function CellValue({ value }: CellValueProps) {
  if (value === null || value === undefined)
    return <span className='opacity-50'>—</span>;

  // Strings largas se truncan
  if (typeof value === "string") {
    const truncated = value.length > 60 ? value.slice(0, 57) + "…" : value;
    return <span title={value}>{truncated}</span>;
  }

  if (typeof value === "number") return <span>{value}</span>;

  // Array de Documents
  if (Array.isArray(value) && value.every((v) => isDocument(v))) {
    const docs = value as Document[];
    return (
      <span className='flex flex-wrap gap-1'>
        {docs.map((doc) => (
          <a
            key={doc.url}
            href={doc.url}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-lexy-border-table text-xs hover:bg-accent transition-colors'
            title={doc.name}>
            <ExternalLink className='size-3' />
            <span className='max-w-[90px] truncate'>{doc.name}</span>
          </a>
        ))}
      </span>
    );
  }

  // Array de Anexos
  if (Array.isArray(value) && value.every((v) => isAnexo(v))) {
    const anexos = value as Anexo[];
    return (
      <div className='flex flex-col gap-1'>
        {anexos.map((anexo, i) => (
          <div key={i} className='flex items-start gap-1'>
            {anexo.doc.length > 0 && (
              <span className='flex flex-wrap gap-1'>
                {anexo.doc.map((doc) => (
                  <a
                    key={doc.url}
                    href={doc.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1 px-1 py-0.5 rounded-sm border border-lexy-border-table text-[10px] hover:bg-accent transition-colors'
                    title={doc.name}>
                    <ExternalLink className='size-3' />
                    <span className='max-w-[70px] truncate'>{doc.name}</span>
                  </a>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Objeto con url único
  if (isDocument(value)) {
    const doc = value as Document;
    return (
      <a
        href={doc.url}
        target='_blank'
        rel='noopener noreferrer'
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-lexy-border-table text-xs hover:bg-accent transition-colors"
        )}
        title={doc.name}>
        <ExternalLink className='size-3' />
        <span className='max-w-[110px] truncate'>{doc.name}</span>
      </a>
    );
  }

  // Fallback genérico para arrays u objetos desconocidos
  if (Array.isArray(value) || typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      const truncated = json.length > 80 ? json.slice(0, 77) + "…" : json;
      return <span title={json}>{truncated}</span>;
    } catch {
      return <span>Objeto</span>;
    }
  }

  return <span>{String(value)}</span>;
}
