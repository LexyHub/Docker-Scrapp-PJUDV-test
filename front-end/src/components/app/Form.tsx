import useDataStore from "@/stores/data.store";
import { Search } from "lucide-react";
import { useState } from "react";
import { FormControl } from "../forms/FormControl";
import { Input } from "../forms/Input";
import { Combobox } from "../base/Combobox";
import { CORTES } from "@/lib/constants/cortes";
import { TRIBUNALES } from "@/lib/constants/tribunales";
import { LIBROS } from "@/lib/constants/libros";
import { getData } from "@/services/data.service";
import { cn } from "@/lib/utils";

interface FormData {
  libro: string;
  rol: number | null;
  ano: number | null;
  corte: number | null;
  tribunal: number | null;
}

export function Form() {
  const dataStore = useDataStore();

  const [formData, setFormData] = useState<FormData>({
    libro: "C",
    rol: null,
    ano: null,
    corte: null,
    tribunal: null,
  });

  const isValid = () =>
    Object.values(formData).every((value) => value !== null && value !== "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startTime = new Date().getTime();
    dataStore.setLoading(true);
    getData({
      libro: formData.libro,
      rol: formData.rol!,
      año: formData.ano!,
      corte: String(formData.corte!),
      tribunal: String(formData.tribunal!),
    })
      .then((response) => {
        if (response.status === "ok") {
          dataStore.setData(response.data.data);
          dataStore.setFormData({
            libro: formData.libro!,
            rol: formData.rol!,
            ano: formData.ano!,
            corte: formData.corte!,
            tribunal: formData.tribunal!,
          });
        }
      })
      .finally(() => {
        const endTime = new Date().getTime();
        dataStore.setLoadingTime(endTime - startTime);
        dataStore.setLoading(false);
      });
  };

  const handleReset = () => {
    setFormData({
      libro: "C",
      rol: null,
      ano: null,
      corte: null,
      tribunal: null,
    });
    dataStore.setLoading(false);
    dataStore.setData(null);
  };

  return (
    <aside className='lg:col-span-3 px-6 py-5 border border-lexy-border-table rounded-md ml-8 shadow-lexy-table bg-lexy-bg-card h-fit'>
      <section className='flex items-center gap-x-1.5 mb-4'>
        <Search className='size-5' />
        <h1 className='text-lg font-semibold'>Buscar causa</h1>
      </section>
      <form onSubmit={handleSubmit} onReset={handleReset}>
        <section className='controls flex flex-col gap-y-3'>
          <FormControl label='Libro'>
            <Combobox
              options={LIBROS}
              className='text-sm placeholder:text-sm placeholder:text-lexy-text-placeholder'
              placeholder='Selecciona un Libro'
              value={formData.libro ? String(formData.libro) : ""}
              onChange={(value) =>
                setFormData({
                  ...formData,
                  libro: value,
                  tribunal: null,
                })
              }
            />
          </FormControl>
          <FormControl label='Rol'>
            <Input
              type='number'
              placeholder='Ej: 208'
              className='text-sm placeholder:text-sm placeholder:text-lexy-text-placeholder'
              value={formData.rol ?? ""}
              onChange={(e) =>
                setFormData({ ...formData, rol: Number(e.target.value) })
              }
            />
          </FormControl>
          <FormControl label='Año'>
            <Input
              type='number'
              placeholder='Ej: 2020'
              className='text-sm placeholder:text-sm placeholder:text-lexy-text-placeholder'
              value={formData.ano ?? ""}
              onChange={(e) =>
                setFormData({ ...formData, ano: Number(e.target.value) })
              }
            />
          </FormControl>
          <FormControl label='Corte'>
            <Combobox
              options={CORTES}
              className='text-sm placeholder:text-sm placeholder:text-lexy-text-placeholder'
              placeholder='Selecciona una Corte'
              value={formData.corte ? String(formData.corte) : ""}
              onChange={(value) =>
                setFormData({
                  ...formData,
                  corte: Number(value),
                  tribunal: null,
                })
              }
            />
          </FormControl>
          <FormControl label='Tribunal'>
            <Combobox
              disabled={!formData.corte}
              options={TRIBUNALES[String(formData.corte)] || []}
              className='text-sm placeholder:text-sm placeholder:text-lexy-text-placeholder'
              placeholder='Selecciona un Tribunal'
              value={formData.tribunal ? String(formData.tribunal) : ""}
              onChange={(value) =>
                setFormData({ ...formData, tribunal: Number(value) })
              }
            />
          </FormControl>
        </section>
        <section className='mt-4 w-full flex justify-between'>
          <button
            type='submit'
            disabled={!isValid() || dataStore.loading}
            className={cn(
              "bg-lexy-brand-primary shadow-lexy-button py-1.5 px-6 text-white rounded-sm font-semibold hover:bg-lexy-brand-secondary-dark transition-all cursor-pointer",
              {
                "disabled:cursor-not-allowed disabled:bg-lexy-brand-primary/50":
                  !isValid() && !dataStore.loading,
                "cursor-wait disabled:bg-lexy-brand-primary/50":
                  dataStore.loading,
              }
            )}>
            {dataStore.loading ? "Buscando..." : "Buscar"}
          </button>
          <button
            type='reset'
            className='bg-lexy-danger shadow-lexy-button py-1.5 px-6 text-white rounded-sm font-semibold hover:bg-lexy-danger/75 transition-all cursor-pointer'>
            Limpiar
          </button>
        </section>
      </form>
    </aside>
  );
}
