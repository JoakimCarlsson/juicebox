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

func (a *AndroidSetup) PrepareInterception(deviceID, certPath string, localProxyPort int) error {
	if err := adb.InstallCACert(deviceID, certPath); err != nil {
		return err
	}
	if err := adb.ReversePort(deviceID, deviceProxyPort, localProxyPort); err != nil {
		return err
	}
	if err := adb.SetProxy(deviceID, "127.0.0.1", deviceProxyPort); err != nil {
		adb.RemoveReverse(deviceID, deviceProxyPort)
		return err
	}
	return nil
}

func (a *AndroidSetup) CleanupInterception(deviceID string) error {
	adb.ClearProxy(deviceID)
	adb.RemoveReverse(deviceID, deviceProxyPort)
	return nil
}

func (a *AndroidSetup) StartLogStream(deviceID string, pid int, sink func(*logcat.Entry), logger *slog.Logger) (io.Closer, error) {
	lc := logcat.NewStreamer(deviceID, pid, sink, logger)
	if err := lc.Start(); err != nil {
		return nil, err
	}
	return lc, nil
}

func (a *AndroidSetup) ListFiles(deviceID, bundleID, path string) ([]bridge.FileEntry, error) {
	return a.bridge.ListFiles(deviceID, bundleID, path)
}

func (a *AndroidSetup) ReadFile(deviceID, bundleID, path string) (*bridge.FileContent, error) {
	return a.bridge.ReadFile(deviceID, bundleID, path)
}

func (a *AndroidSetup) FindFiles(deviceID, bundleID, pattern, base string) ([]string, error) {
	return a.bridge.FindFiles(deviceID, bundleID, pattern, base)
}

func (a *AndroidSetup) PullDatabase(deviceID, bundleID, path string) (string, error) {
	return a.bridge.PullDatabase(deviceID, bundleID, path)
}

func (a *AndroidSetup) ListProcesses(deviceID string) ([]bridge.Process, error) {
	return a.bridge.ListProcesses(deviceID)
}

func (a *AndroidSetup) Capabilities() []string {
	return []string{"filesystem", "database", "logstream", "frida"}
}
