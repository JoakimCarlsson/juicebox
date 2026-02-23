package filesystem

import "github.com/joakimcarlsson/juicebox/internal/bridge"

type ListResponse struct {
	Path    string             `json:"path"`
	Entries []bridge.FileEntry `json:"entries"`
}

type FindResponse struct {
	Pattern  string   `json:"pattern"`
	BasePath string   `json:"basePath"`
	Paths    []string `json:"paths"`
}
