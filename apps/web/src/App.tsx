import { useEffect } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query';
import { routes } from '@/app/routes';
import { Toaster, ConfirmHost } from '@/ui';
import { useAuth } from '@/lib/auth-store';
import { applyBrand } from '@/lib/theme';
import { sounds } from '@/lib/sound';

const router = createBrowserRouter(routes);

export function App() {
  const business = useAuth((s) => s.business);
  useEffect(() => {
    if (business?.primaryColor) applyBrand(business.primaryColor);
  }, [business?.primaryColor]);
  useEffect(() => {
    // desbloquea el audio en la primera interacción (requisito de los navegadores)
    const unlock = () => sounds.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
      <ConfirmHost />
    </QueryClientProvider>
  );
}
