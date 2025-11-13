import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/base/table";
import useDataStore from "@/stores/data.store";
import { CellValue } from "./CellValue";

interface Props {
  cuaderno: string;
}

const HEADERS = [
  "rol_origen",
  "tipo_exhorto",
  "rol_destino",
  "fecha_ordena_exhorto",
  "fecha_recepcion_exhorto",
  "tribunal_destino",
  "estado_exhorto",
] as const;

export function ExhortosCiv({ cuaderno }: Props) {
  const dataStore = useDataStore();
  const rows = dataStore.getCuaderno(cuaderno)?.exhortosCiv ?? [];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {HEADERS.map((header) => (
            <TableHead
              key={header}
              className='text-lexy-text-secondary font-semibold first:pl-4 last:pr-4'>
              {header.toUpperCase().replaceAll("_", " ")}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows!.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={HEADERS.length}
              className='text-center text-lexy-text-secondary'>
              No hay información disponible.
            </TableCell>
          </TableRow>
        ) : (
          rows?.map((item) => (
            <TableRow key={crypto.randomUUID()}>
              {HEADERS.map((header) => (
                <TableCell
                  key={header}
                  className='font-light first:pl-4 last:pr-4'>
                  <CellValue value={item[header as keyof typeof item]} />
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
