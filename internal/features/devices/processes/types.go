package processes

import "github.com/joakimcarlsson/juicebox/internal/bridge"

type ListProcessesResponse struct {
	Processes []bridge.Process `json:"processes"`
}
