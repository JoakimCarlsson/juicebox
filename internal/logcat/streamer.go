package logcat

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"os/exec"
	"sync"
)

type Sink func(entry *Entry)

type Streamer struct {
	deviceID string
	pid      int
	sink     Sink
	logger   *slog.Logger

	cancel context.CancelFunc
	done   chan struct{}
	wg     sync.WaitGroup
}

func NewStreamer(
	deviceID string,
	pid int,
	sink Sink,
	logger *slog.Logger,
) *Streamer {
	return &Streamer{
		deviceID: deviceID,
		pid:      pid,
		sink:     sink,
		logger:   logger,
		done:     make(chan struct{}),
	}
}

func (s *Streamer) Start() error {
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel

	cmd := exec.CommandContext(ctx, "adb",
		"-s", s.deviceID,
		"logcat",
		fmt.Sprintf("--pid=%d", s.pid),
		"-v", "threadtime",
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("logcat: stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("logcat: start: %w", err)
	}

	s.logger.Info("logcat streamer started", "pid", s.pid)

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer close(s.done)

		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)

		for scanner.Scan() {
			entry := ParseLine(scanner.Text())
			if entry != nil {
				s.sink(entry)
			}
		}

		if err := cmd.Wait(); err != nil {
			if ctx.Err() == nil {
				s.logger.Warn("logcat process exited", "error", err)
			}
		}

		s.logger.Info("logcat streamer stopped", "pid", s.pid)
	}()

	return nil
}

func (s *Streamer) Stop() {
	if s.cancel != nil {
		s.cancel()
	}
	s.wg.Wait()
}

func (s *Streamer) Close() error {
	s.Stop()
	return nil
}

func (s *Streamer) Done() <-chan struct{} {
	return s.done
}
