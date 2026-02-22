package logcat

import (
	"fmt"
	"sync/atomic"
	"time"
)

var entryCounter atomic.Int64

func generateID() string {
	return fmt.Sprintf("lc-%d-%d", time.Now().UnixMilli(), entryCounter.Add(1))
}

type Level string

const (
	LevelVerbose Level = "V"
	LevelDebug   Level = "D"
	LevelInfo    Level = "I"
	LevelWarning Level = "W"
	LevelError   Level = "E"
	LevelFatal   Level = "F"
)

type Entry struct {
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
	PID       int    `json:"pid"`
	TID       int    `json:"tid"`
	Level     Level  `json:"level"`
	Tag       string `json:"tag"`
	Message   string `json:"message"`
}
