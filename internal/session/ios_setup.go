package session

import (
	"errors"
	"io"
	"log/slog"

	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/logcat"
)

type IOSSetup struct{}

func (i *IOSSetup) PrepareInterception(deviceId, certPath string, localProxyPort int) error {
	return errors.ErrUnsupported
}

func (i *IOSSetup) CleanupInterception(deviceId string) error {
	return errors.ErrUnsupported
}

func (i *IOSSetup) StartLogStream(deviceId string, pid int, sink func(*logcat.Entry), logger *slog.Logger) (io.Closer, error) {
	return nil, nil
}

func (i *IOSSetup) ListFiles(deviceId, bundleId, path string) ([]bridge.FileEntry, error) {
	return nil, errors.ErrUnsupported
}

func (i *IOSSetup) ReadFile(deviceId, bundleId, path string) (*bridge.FileContent, error) {
	return nil, errors.ErrUnsupported
}

func (i *IOSSetup) FindFiles(deviceId, bundleId, pattern, base string) ([]string, error) {
	return nil, errors.ErrUnsupported
}

func (i *IOSSetup) PullDatabase(deviceId, bundleId, path string) (string, error) {
	return "", errors.ErrUnsupported
}

func (i *IOSSetup) ListProcesses(deviceId string) ([]bridge.Process, error) {
	return nil, errors.ErrUnsupported
}

func (i *IOSSetup) Capabilities() []string {
	return []string{}
}
