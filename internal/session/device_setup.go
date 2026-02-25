package session

import (
	"io"
	"log/slog"

	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/logcat"
)

type DeviceSetup interface {
	PrepareInterception(deviceID, certPath string, localProxyPort int) error
	CleanupInterception(deviceID string) error
	StartLogStream(
		deviceID string,
		pid int,
		sink func(*logcat.Entry),
		logger *slog.Logger,
	) (io.Closer, error)
	ListFiles(deviceID, bundleID, path string) ([]bridge.FileEntry, error)
	ReadFile(deviceID, bundleID, path string) (*bridge.FileContent, error)
	FindFiles(deviceID, bundleID, pattern, base string) ([]string, error)
	PullDatabase(deviceID, bundleID, path string) (string, error)
	ListProcesses(deviceID string) ([]bridge.Process, error)
	Capabilities() []string
}
