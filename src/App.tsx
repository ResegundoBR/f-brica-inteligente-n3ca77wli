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
import PcpDashboard from './pages/pcp/PcpDashboard'
import PcpOrders from './pages/pcp/PcpOrders'
import PcpMaterials from './pages/pcp/PcpMaterials'
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
import { useEmergencyStyles } from './hooks/use-emergency'

function GlobalHooks() {
  useEmergencyStyles()
  return null
}

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
                  <GlobalHooks />
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
              <Route
                path="/pcp/dashboard"
                element={
                  <RoleGuard module="pcp">
                    <PcpDashboard />
                  </RoleGuard>
                }
              />
              <Route
                path="/pcp/kanban"
                element={
                  <RoleGuard module="painel_controle">
                    <PcpKanban />
                  </RoleGuard>
                }
              />
              <Route
                path="/pcp/ordens"
                element={
                  <RoleGuard module="ordens_producao">
                    <PcpOrders />
                  </RoleGuard>
                }
              />
              <Route
                path="/pcp/clientes"
                element={
                  <RoleGuard module="pcp">
                    <PcpClients />
                  </RoleGuard>
                }
              />
              <Route
                path="/pcp/operador"
                element={
                  <RoleGuard module="operator">
                    <PcpOperator />
                  </RoleGuard>
                }
              />
              <Route
                path="/pcp/materiais"
                element={
                  <RoleGuard module="suprimentos">
                    <PcpMaterials />
                  </RoleGuard>
                }
              />
              <Route
                path="/pcp/comercial"
                element={
                  <RoleGuard module="visao_comercial">
                    <PcpCommercial />
                  </RoleGuard>
                }
              />
              <Route
                path="/pcp/ocorrencias"
                element={
                  <RoleGuard module="pcp">
                    <PcpOcorrencias />
                  </RoleGuard>
                }
              />
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
