export type GetDataServiceProps = {
  libro: string;
  rol: number;
  año: number;
  corte: string;
  tribunal: string;
};

export async function getData({
  libro,
  rol,
  año,
  corte,
  tribunal,
}: GetDataServiceProps) {
  try {
    const data = await fetch("http://localhost:3000/obtener-causa", {
      method: "POST",
      body: JSON.stringify({ libro, rol, año, corte, tribunal }),
    });
    const json = await data.json();
    return { status: "ok", data: json };
  } catch (error: unknown) {
    console.error("Error fetching data:", error);
    if (error instanceof Error)
      return { status: "error", error: error.message };
    return { status: "error", error: "Unknown error occurred" };
  }
}
