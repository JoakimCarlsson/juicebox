package session

import "github.com/joakimcarlsson/juicebox/internal/adb"

const deviceProxyPort = 8082

type AndroidSetup struct{}

func (a *AndroidSetup) PrepareInterception(deviceId, certPath string, localProxyPort int) error {
	if err := adb.InstallCACert(deviceId, certPath); err != nil {
		return err
	}
	if err := adb.ReversePort(deviceId, deviceProxyPort, localProxyPort); err != nil {
		return err
	}
	if err := adb.SetProxy(deviceId, "127.0.0.1", deviceProxyPort); err != nil {
		adb.RemoveReverse(deviceId, deviceProxyPort)
		return err
	}
	return nil
}

func (a *AndroidSetup) CleanupInterception(deviceId string) error {
	adb.ClearProxy(deviceId)
	adb.RemoveReverse(deviceId, deviceProxyPort)
	return nil
}

func (a *AndroidSetup) SupportsLogcat() bool { return true }
