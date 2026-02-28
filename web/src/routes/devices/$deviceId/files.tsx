import { createFileRoute } from '@tanstack/react-router'
import { FileBrowser } from '@/components/filesystem/FileBrowser'
import { NoAppAttachedState } from '@/components/devices/NoAppAttachedState'
import { useAttachedApps } from '@/contexts/AttachedAppsContext'

export const Route = createFileRoute('/devices/$deviceId/files')({
  component: FilesPage,
})

function FilesPage() {
  const { selectedApp } = useAttachedApps()

  if (!selectedApp) {
    return <NoAppAttachedState feature="File Browser" />
  }

  return <FileBrowser sessionId={selectedApp.sessionId} bundleId={selectedApp.bundleId} />
}
