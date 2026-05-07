import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Layout from './components/Layout'
import NotFound from './pages/NotFound'
import Dashboard from './pages/Dashboard'
import CatalogList from './pages/catalog/CatalogList'
import CatalogDetail from './pages/catalog/CatalogDetail'
import CatalogCreate from './pages/catalog/CatalogCreate'
import Learning from './pages/Learning'
import AdminUsers from './pages/admin/AdminUsers'
import AdminRoles from './pages/admin/AdminRoles'
import AdminStatuses from './pages/admin/AdminStatuses'
import AdminLogs from './pages/admin/AdminLogs'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import { AuthProvider } from './hooks/use-auth'
import { AuthGuard } from './components/AuthGuard'

const App = () => (
  <AuthProvider>
    <BrowserRouter future={{ v7_startTransition: false, v7_relativeSplatPath: false }}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<ChangePassword />} />

          <Route element={<AuthGuard />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/catalogo" element={<CatalogList />} />
              <Route path="/catalogo/novo" element={<CatalogCreate />} />
              <Route path="/catalogo/:id" element={<CatalogDetail />} />
              <Route path="/aprendizado" element={<Learning />} />
              <Route path="/admin/usuarios" element={<AdminUsers />} />
              <Route path="/admin/funcoes" element={<AdminRoles />} />
              <Route path="/admin/status" element={<AdminStatuses />} />
              <Route path="/admin/logs" element={<AdminLogs />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </AuthProvider>
)

export default App
