package session

import (
	"io"
	"log/slog"

	"github.com/joakimcarlsson/juicebox/internal/adb"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/logcat"
)

const deviceProxyPort = 8082

type AndroidSetup struct {
	bridge *bridge.Client
}

func NewAndroidSetup(bridgeClient *bridge.Client) *AndroidSetup {
	return &AndroidSetup{bridge: bridgeClient}
}

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

func (a *AndroidSetup) StartLogStream(deviceId string, pid int, sink func(*logcat.Entry), logger *slog.Logger) (io.Closer, error) {
	lc := logcat.NewStreamer(deviceId, pid, sink, logger)
	if err := lc.Start(); err != nil {
		return nil, err
	}
	return lc, nil
}

func (a *AndroidSetup) ListFiles(deviceId, bundleId, path string) ([]bridge.FileEntry, error) {
	return a.bridge.ListFiles(deviceId, bundleId, path)
}

func (a *AndroidSetup) ReadFile(deviceId, bundleId, path string) (*bridge.FileContent, error) {
	return a.bridge.ReadFile(deviceId, bundleId, path)
}

func (a *AndroidSetup) FindFiles(deviceId, bundleId, pattern, base string) ([]string, error) {
	return a.bridge.FindFiles(deviceId, bundleId, pattern, base)
}

func (a *AndroidSetup) PullDatabase(deviceId, bundleId, path string) (string, error) {
	return a.bridge.PullDatabase(deviceId, bundleId, path)
}

func (a *AndroidSetup) ListProcesses(deviceId string) ([]bridge.Process, error) {
	return a.bridge.ListProcesses(deviceId)
}

func (a *AndroidSetup) Capabilities() []string {
	return []string{"filesystem", "database", "logstream"}
}
