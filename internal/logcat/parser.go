package logcat

import (
	"regexp"
	"strconv"
	"strings"
)

var threadtimeRe = regexp.MustCompile(
	`^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.+?)\s*:\s(.*)$`,
)

func ParseLine(line string) *Entry {
	line = strings.TrimRight(line, "\r\n")
	if line == "" {
		return nil
	}

	matches := threadtimeRe.FindStringSubmatch(line)
	if matches == nil {
		return nil
	}

	pid, _ := strconv.Atoi(matches[2])
	tid, _ := strconv.Atoi(matches[3])

	return &Entry{
		ID:        generateID(),
		Timestamp: matches[1],
		PID:       pid,
		TID:       tid,
		Level:     Level(matches[4]),
		Tag:       strings.TrimSpace(matches[5]),
		Message:   matches[6],
	}
}
