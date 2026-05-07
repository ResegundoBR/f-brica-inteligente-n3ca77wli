import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { Header } from './header'

export default function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen w-full overflow-hidden bg-background">
        <Header />
        <main className="flex-1 overflow-auto p-4 md:p-6 bg-slate-50/50 dark:bg-transparent">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
