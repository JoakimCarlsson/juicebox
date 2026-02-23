package session

import (
	"io"
	"log/slog"

	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/logcat"
)

type DeviceSetup interface {
	PrepareInterception(deviceId, certPath string, localProxyPort int) error
	CleanupInterception(deviceId string) error
	StartLogStream(deviceId string, pid int, sink func(*logcat.Entry), logger *slog.Logger) (io.Closer, error)
	ListFiles(deviceId, bundleId, path string) ([]bridge.FileEntry, error)
	ReadFile(deviceId, bundleId, path string) (*bridge.FileContent, error)
	FindFiles(deviceId, bundleId, pattern, base string) ([]string, error)
	PullDatabase(deviceId, bundleId, path string) (string, error)
	ListProcesses(deviceId string) ([]bridge.Process, error)
	Capabilities() []string
}
