interface Props {
  label?: string;
  children: React.ReactNode;
  error?: string;
}

export function FormControl({ label, children, error }: Props) {
  return (
    <div>
      {label && <label className='block mb-1 font-medium'>{label}</label>}
      {children}
      {error && <p className='mt-1 text-sm text-red-600'>{error}</p>}
    </div>
  );
}
