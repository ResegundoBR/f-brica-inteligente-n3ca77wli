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
import AdminStatuses from './pages/admin/AdminStatuses'
import AdminLogs from './pages/admin/AdminLogs'
import PcpKanban from './pages/pcp/PcpKanban'
import PcpOrders from './pages/pcp/PcpOrders'
import PcpClients from './pages/pcp/PcpClients'
import PcpOperator from './pages/pcp/PcpOperator'
import PcpCommercial from './pages/pcp/PcpCommercial'
import PcpOcorrencias from './pages/pcp/PcpOcorrencias'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import { AuthProvider } from './hooks/use-auth'
import { AuthGuard } from './components/AuthGuard'
import { StatusNotifier } from './components/StatusNotifier'
import { RoleGuard } from './components/RoleGuard'
import Unauthorized from './pages/Unauthorized'

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
            <Route
              element={
                <>
                  <StatusNotifier />
                  <Layout />
                </>
              }
            >
              <Route
                path="/"
                element={
                  <RoleGuard module="dashboard">
                    <Dashboard />
                  </RoleGuard>
                }
              />
              <Route
                path="/catalogo"
                element={
                  <RoleGuard module="catalog">
                    <CatalogList />
                  </RoleGuard>
                }
              />
              <Route
                path="/catalogo/:id"
                element={
                  <RoleGuard module="catalog">
                    <CatalogDetail />
                  </RoleGuard>
                }
              />
              <Route
                path="/aprendizado"
                element={
                  <RoleGuard module="learning">
                    <Learning />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin/usuarios"
                element={
                  <RoleGuard module="users">
                    <AdminUsers />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin/funcoes"
                element={
                  <RoleGuard module="users">
                    <AdminRoles />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin/status"
                element={
                  <RoleGuard module="users">
                    <AdminStatuses />
                  </RoleGuard>
                }
              />
              <Route
                path="/admin/logs"
                element={
                  <RoleGuard module="users">
                    <AdminLogs />
                  </RoleGuard>
                }
              />
              <Route path="/pcp/kanban" element={<PcpKanban />} />
              <Route path="/pcp/ordens" element={<PcpOrders />} />
              <Route path="/pcp/clientes" element={<PcpClients />} />
              <Route path="/pcp/operador" element={<PcpOperator />} />
              <Route path="/pcp/comercial" element={<PcpCommercial />} />
              <Route path="/pcp/ocorrencias" element={<PcpOcorrencias />} />
              <Route path="/unauthorized" element={<Unauthorized />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </BrowserRouter>
  </AuthProvider>
)

export default App
