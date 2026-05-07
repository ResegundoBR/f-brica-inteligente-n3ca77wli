import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Layout from './components/Layout'
import NotFound from './pages/NotFound'
import Dashboard from './pages/Dashboard'
import CatalogList from './pages/catalog/CatalogList'
import CatalogDetail from './pages/catalog/CatalogDetail'
import Learning from './pages/Learning'
import AdminUsers from './pages/admin/AdminUsers'
import AdminRoles from './pages/admin/AdminRoles'
import AdminLogs from './pages/admin/AdminLogs'
import { AppProvider } from './contexts/app-context'

const App = () => (
  <AppProvider>
    <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/catalogo" element={<CatalogList />} />
            <Route path="/catalogo/:id" element={<CatalogDetail />} />
            <Route path="/aprendizado" element={<Learning />} />
            <Route path="/admin/usuarios" element={<AdminUsers />} />
            <Route path="/admin/funcoes" element={<AdminRoles />} />
            <Route path="/admin/logs" element={<AdminLogs />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </AppProvider>
)

export default App
