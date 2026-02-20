package apps

import "github.com/joakimcarlsson/juicebox/internal/bridge"

type ListAppsResponse struct {
	Apps []bridge.App `json:"apps"`
}
