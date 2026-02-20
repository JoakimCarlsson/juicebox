package list

import "github.com/joakimcarlsson/juicebox/internal/bridge"

type ListDevicesResponse struct {
	Devices []bridge.Device `json:"devices"`
}
