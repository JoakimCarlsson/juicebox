import { createFileRoute } from '@tanstack/react-router'
import { ClassBrowser } from '@/components/classes/ClassBrowser'
import { NoAppAttachedState } from '@/components/devices/NoAppAttachedState'
import { useAttachedApps } from '@/contexts/AttachedAppsContext'

export const Route = createFileRoute('/devices/$deviceId/classes')({
  component: ClassesPage,
})

function ClassesPage() {
  const { selectedApp } = useAttachedApps()

  if (!selectedApp) {
    return <NoAppAttachedState feature="Class Browser" />
  }

  return <ClassBrowser sessionId={selectedApp.sessionId} />
}
