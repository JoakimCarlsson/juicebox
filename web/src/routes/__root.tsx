import { createRootRouteWithContext, Outlet, useLocation } from "@tanstack/react-router"
import type { QueryClient } from "@tanstack/react-query"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppStatusProvider } from "@/contexts/AppStatusContext"
import { Sidebar } from "@/components/layout/Sidebar"
import { StatusBar } from "@/components/layout/StatusBar"

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  const location = useLocation()
  const hideSidebar = location.pathname.includes("/app/")

  return (
    <AppStatusProvider>
      <TooltipProvider>
        <div className="flex h-screen flex-col bg-background font-sans antialiased">
          <div className="flex flex-1 min-h-0">
            {!hideSidebar && <Sidebar />}
            <main className="flex-1 min-h-0 min-w-0">
              <Outlet />
            </main>
          </div>
          <StatusBar />
        </div>
      </TooltipProvider>
    </AppStatusProvider>
  )
}
