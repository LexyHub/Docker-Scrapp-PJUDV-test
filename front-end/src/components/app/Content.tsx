import useDataStore from "@/stores/data.store";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../base/tabs";
import { Combobox } from "../base/Combobox";
import { useEffect, useMemo, useState } from "react";
import { TipoMovimiento } from "../ui/TipoMovimiento";
import { HistoriaCiv } from "../ui/tables/HistoriaCiv";
import { LitigantesCiv } from "../ui/tables/LitigantesCiv";
import { NotificacionesCiv } from "../ui/tables/NotificacionesCiv";
import { EscritosCiv } from "../ui/tables/EscritosCiv";
import { ExhortosCiv } from "../ui/tables/ExhortosCiv";
import { InfoNotificaciones } from "../ui/tables/InfoNotificaciones";

export function Content() {
  const dataStore = useDataStore();

  const [cuaderno, setCuaderno] = useState<string | null>(null);
  const [tabla, setTabla] = useState<string>("historiaCiv");

  // Inicializa cuaderno cuando llegan datos
  useEffect(() => {
    if (dataStore.data) {
      const keys = Object.keys(dataStore.data.cuadernos);
      if (keys.length && !cuaderno) setCuaderno(keys[0]);
    } else {
      setCuaderno(null);
    }
  }, [dataStore.data, cuaderno]);

  const cuadernosAsKeys: { value: string; label: string }[] = useMemo(() => {
    if (!dataStore.data) return [];
    return Object.keys(dataStore.data.cuadernos).map((k) => ({
      value: k,
      label: k,
    }));
  }, [dataStore.data]);

  const TABLAS = [
    { key: "historiaCiv", label: "Historia Civ." },
    { key: "litigantesCiv", label: "Litigantes Civ." },
    { key: "notificacionesCiv", label: "Notificaciones Civ." },
    { key: "escritosCiv", label: "Escritos Civ." },
    { key: "exhortosCiv", label: "Exhortos Civ." },
  ] as const;

  const TablaActiva = useMemo(() => {
    if (!cuaderno) return null;
    switch (tabla) {
      case "historiaCiv":
        return <HistoriaCiv cuaderno={cuaderno} />;
      case "litigantesCiv":
        return <LitigantesCiv cuaderno={cuaderno} />;
      case "notificacionesCiv":
        return <NotificacionesCiv cuaderno={cuaderno} />;
      case "escritosCiv":
        return <EscritosCiv cuaderno={cuaderno} />;
      case "exhortosCiv":
        return <ExhortosCiv cuaderno={cuaderno} />;
      default:
        return null;
    }
  }, [tabla, cuaderno]);

  return (
    <main className='lg:col-span-6 overflow-hidden h-fit px-6 py-5 border border-lexy-border-table rounded-md shadow-lexy-table bg-lexy-bg-card'>
      {dataStore.loading ? (
        <p className='text-lexy-text-secondary text-sm'>
          Cargando datos del caso...
        </p>
      ) : !dataStore.data ? (
        <p className='text-lexy-text-secondary text-sm'>
          El contenido del caso se mostrará después de realizar una búsqueda.
        </p>
      ) : (
        <>
          <h1 className='text-xl font-semibold mb-4'>
            Causa: {dataStore.formData.libro}-{dataStore.formData.rol}-
            {dataStore.formData.ano}
          </h1>
          <section>
            <Tabs defaultValue='movimientos' className='w-full'>
              <TabsList className='grid w-full grid-cols-2'>
                <TabsTrigger
                  value='movimientos'
                  className='cursor-pointer transition-all'>
                  Movimientos
                </TabsTrigger>
                <TabsTrigger
                  value='notificaciones'
                  className='cursor-pointer transition-all'>
                  Info. Notificaciones
                </TabsTrigger>
              </TabsList>

              <TabsContent value='movimientos' className='space-y-4'>
                <Combobox
                  options={cuadernosAsKeys}
                  value={cuaderno}
                  onChange={(value) => setCuaderno(value)}
                  className='h-10 pl-4 shadow-lexy-table'
                  placeholder='Selecciona un Cuaderno'
                />
                <section className='flex flex-wrap gap-x-2.5 overflow-x-auto pb-2'>
                  {TABLAS.map((t) => (
                    <TipoMovimiento
                      key={t.key}
                      text={t.label}
                      objKey={t.key}
                      onClick={(value) => setTabla(value || "historiaCiv")}
                      isActive={tabla === t.key}
                    />
                  ))}
                </section>
                <section className='rounded-sm border border-lexy-border-table h-fit max-h-136 overflow-auto'>
                  {TablaActiva || (
                    <p className='text-sm text-lexy-text-secondary p-4'>
                      Selecciona un cuaderno para ver los movimientos.
                    </p>
                  )}
                </section>
              </TabsContent>
              <TabsContent value='notificaciones'>
                <InfoNotificaciones />
              </TabsContent>
            </Tabs>
          </section>
        </>
      )}
    </main>
  );
}
