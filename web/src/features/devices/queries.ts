import { queryOptions } from '@tanstack/react-query'
import { fetchApps, fetchDeviceInfo, fetchDevices, fetchProcesses } from './api'

export function devicesQueryOptions() {
  return queryOptions({
    queryKey: ['devices'],
    queryFn: fetchDevices,
  })
}

export function appsQueryOptions(deviceId: string) {
  return queryOptions({
    queryKey: ['devices', deviceId, 'apps'],
    queryFn: () => fetchApps(deviceId),
    enabled: !!deviceId,
  })
}

export function processesQueryOptions(deviceId: string) {
  return queryOptions({
    queryKey: ['devices', deviceId, 'processes'],
    queryFn: () => fetchProcesses(deviceId),
    enabled: !!deviceId,
  })
}

export function deviceInfoQueryOptions(deviceId: string) {
  return queryOptions({
    queryKey: ['devices', deviceId, 'info'],
    queryFn: () => fetchDeviceInfo(deviceId),
    enabled: !!deviceId,
  })
}
