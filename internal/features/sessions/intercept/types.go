package intercept

import "github.com/joakimcarlsson/juicebox/internal/proxy"

type stateResponse struct {
	Enabled      bool                  `json:"enabled"`
	Rules        []proxy.InterceptRule `json:"rules"`
	PendingCount int                   `json:"pendingCount"`
}

type updateRequest struct {
	Enabled *bool                  `json:"enabled,omitempty"`
	Rules   *[]proxy.InterceptRule `json:"rules,omitempty"`
}

type resolveAllRequest struct {
	Action proxy.InterceptAction `json:"action"`
}
