import type { APIResponse, Cuaderno } from "@/types/data.type";
import { create } from "zustand";

type DataState = {
  data: APIResponse | null;
  formData: Record<string, string | number>;
  loading: boolean;
  loadingTime: number | null;
  setLoading: (loading: boolean) => void;
  setLoadingTime: (loadingTime: number | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
  setFormData: (formData: Record<string, string | number>) => void;
  setData: (newData: APIResponse | null) => void;
  getCuadernos: () => Record<string, Cuaderno> | null;
  getCuaderno: (key: string) => Cuaderno | null;
};

const useDataStore = create<DataState>((set, get) => ({
  data: null,
  formData: {},
  loading: false,
  loadingTime: null,
  error: null,
  setLoading: (loading: boolean) => set({ loading }),
  setLoadingTime: (loadingTime: number | null) => set({ loadingTime }),
  setError: (error: string | null) => set({ error }),
  setFormData: (formData: Record<string, string | number>) => set({ formData }),
  setData: (newData: APIResponse | null) => set({ data: newData }),
  getCuadernos: () => {
    const data = get().data;
    return data ? data.cuadernos : null;
  },
  getCuaderno: (key: string) => {
    const cuadernos = get().getCuadernos();
    return cuadernos && key in cuadernos ? cuadernos[key] : null;
  },
}));

export default useDataStore;
