package session

import (
	"errors"
	"io"
	"log/slog"

	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/logcat"
)

type IOSSetup struct{}

func (i *IOSSetup) PrepareInterception(
	deviceID, certPath string,
	localProxyPort int,
) error {
	return errors.ErrUnsupported
}

func (i *IOSSetup) CleanupInterception(deviceID string) error {
	return errors.ErrUnsupported
}

func (i *IOSSetup) StartLogStream(
	deviceID string,
	pid int,
	sink func(*logcat.Entry),
	logger *slog.Logger,
) (io.Closer, error) {
	return nil, nil
}

func (i *IOSSetup) ListFiles(
	deviceID, bundleID, path string,
) ([]bridge.FileEntry, error) {
	return nil, errors.ErrUnsupported
}

func (i *IOSSetup) ReadFile(
	deviceID, bundleID, path string,
) (*bridge.FileContent, error) {
	return nil, errors.ErrUnsupported
}

func (i *IOSSetup) FindFiles(
	deviceID, bundleID, pattern, base string,
) ([]string, error) {
	return nil, errors.ErrUnsupported
}

func (i *IOSSetup) PullDatabase(
	deviceID, bundleID, path string,
) (string, error) {
	return "", errors.ErrUnsupported
}

func (i *IOSSetup) ListProcesses(deviceID string) ([]bridge.Process, error) {
	return nil, errors.ErrUnsupported
}

func (i *IOSSetup) Capabilities() []string {
	return []string{}
}
