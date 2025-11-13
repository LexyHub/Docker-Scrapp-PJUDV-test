import useDataStore from "@/stores/data.store";
import { ChartColumn, Clock } from "lucide-react";

export function Dashboard() {
  const dataStore = useDataStore();

  return (
    <aside className='lg:col-span-3 px-6 py-5 border border-lexy-border-table rounded-md mr-8 shadow-lexy-table bg-lexy-bg-card h-fit'>
      <section className='flex items-center gap-x-1.5 mb-4'>
        <ChartColumn className='size-5' />
        <h1 className='text-lg font-semibold'>Estadísticas del Caso</h1>
      </section>
      <section>
        {!dataStore.data ? (
          <p className='text-lexy-text-secondary text-sm'>
            Las estadísticas se mostrarán después de realizar una búsqueda.
            <br />
            <br />
            <span className='font-light text-neutral-400'>
              Estas estadísticas son más ligadas al funcionamiento del{" "}
              <u>Scrap</u> que del funcionamiento de la Web u contenido
              específico
            </span>
          </p>
        ) : (
          <>
            <div className='p-4 grid grid-cols-[auto_1fr] gap-x-3 items-center border border-lexy-border-table rounded-sm'>
              <div className='p-2 bg-gray-300 rounded-full'>
                <Clock className='size-5' />
              </div>
              <div>
                <span className='text-sm font-medium text-muted-foreground'>
                  Tiempo de respuesta
                </span>
                <h3 className='text-2xl font-bold'>
                  {(dataStore.loadingTime! / 1000).toFixed(2)}s
                </h3>
              </div>
            </div>
          </>
        )}
      </section>
    </aside>
  );
}
