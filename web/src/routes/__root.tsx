import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppStatusProvider } from '@/contexts/AppStatusContext'
import { StatusBar } from '@/components/layout/StatusBar'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout() {
  return (
    <AppStatusProvider>
      <TooltipProvider>
        <div className="flex h-screen flex-col bg-background font-sans antialiased">
          <main className="flex-1 min-h-0 min-w-0">
            <Outlet />
          </main>
          <StatusBar />
        </div>
      </TooltipProvider>
    </AppStatusProvider>
  )
}
