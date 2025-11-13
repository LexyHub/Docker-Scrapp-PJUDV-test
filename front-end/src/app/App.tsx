import { Content } from "@/components/app/Content";
import { Dashboard } from "@/components/app/Dashboard";
import { Form } from "@/components/app/Form";
import { Header } from "@/components/ui/Header";

export function App() {
  return (
    <div className='w-dvw h-dvh text-lexy-text-primary bg-lexy-bg-platform overflow-hidden'>
      <Header />
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-12'>
        <Form />
        <Content />
        <Dashboard />
      </div>
    </div>
  );
}
