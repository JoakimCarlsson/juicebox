package session

type DeviceSetup interface {
	PrepareInterception(deviceId, certPath string, localProxyPort int) error
	CleanupInterception(deviceId string) error
	SupportsLogcat() bool
}
