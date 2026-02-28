package settings

import (
	"encoding/json"
	"net/http"

	"github.com/joakimcarlsson/ai/model"
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/response"
)

var providerKeys = []string{"api_key_openai", "api_key_anthropic", "api_key_google"}

type availableModel struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Provider string `json:"provider"`
}

var providerModels = map[string][]availableModel{
	"api_key_openai": {
		{ID: string(model.GPT53Codex), Name: "GPT-5.3 Codex", Provider: "openai"},
		{ID: string(model.GPT52Codex), Name: "GPT-5.2 Codex", Provider: "openai"},
		{ID: string(model.GPT52), Name: "GPT-5.2", Provider: "openai"},
		{ID: string(model.GPT5Mini), Name: "GPT-5 mini", Provider: "openai"},
		{ID: string(model.GPT5Nano), Name: "GPT-5 nano", Provider: "openai"},
	},
	"api_key_anthropic": {
		{ID: string(model.Claude46Opus), Name: "Claude 4.6 Opus", Provider: "anthropic"},
		{ID: string(model.Claude46Sonnet), Name: "Claude 4.6 Sonnet", Provider: "anthropic"},
		{ID: string(model.Claude45Haiku), Name: "Claude 4.5 Haiku", Provider: "anthropic"},
	},
	"api_key_google": {
		{ID: string(model.Gemini31Pro), Name: "Gemini 3.1 Pro", Provider: "gemini"},
		{ID: string(model.Gemini25), Name: "Gemini 2.5 Pro", Provider: "gemini"},
		{ID: string(model.Gemini25Flash), Name: "Gemini 2.5 Flash", Provider: "gemini"},
	},
}

type Handler struct {
	db *db.DB
}

func NewHandler(database *db.DB) *Handler {
	return &Handler{db: database}
}

func maskKey(key string) string {
	if len(key) <= 8 {
		return "****"
	}
	return key[:4] + "****" + key[len(key)-4:]
}

func (h *Handler) Get(c *router.Context) {
	ctx := c.Request.Context()
	settings, err := h.db.GetSettings(ctx, providerKeys)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	masked := make(map[string]string, len(settings))
	for k, v := range settings {
		masked[k] = maskKey(v)
	}

	c.JSON(http.StatusOK, masked)
}

func (h *Handler) Update(c *router.Context) {
	ctx := c.Request.Context()

	var body map[string]string
	if err := json.NewDecoder(c.Request.Body).Decode(&body); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	allowed := map[string]bool{
		"api_key_openai":    true,
		"api_key_anthropic": true,
		"api_key_google":    true,
	}

	for k, v := range body {
		if !allowed[k] {
			continue
		}
		if v == "" {
			if err := h.db.DeleteSetting(ctx, k); err != nil {
				response.Error(c, http.StatusInternalServerError, err.Error())
				return
			}
			continue
		}
		if err := h.db.SetSetting(ctx, k, v); err != nil {
			response.Error(c, http.StatusInternalServerError, err.Error())
			return
		}
	}

	settings, err := h.db.GetSettings(ctx, providerKeys)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	masked := make(map[string]string, len(settings))
	for k, v := range settings {
		masked[k] = maskKey(v)
	}

	c.JSON(http.StatusOK, masked)
}

func (h *Handler) Models(c *router.Context) {
	ctx := c.Request.Context()
	settings, err := h.db.GetSettings(ctx, providerKeys)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	var models []availableModel
	for _, key := range providerKeys {
		if _, ok := settings[key]; ok {
			models = append(models, providerModels[key]...)
		}
	}

	if models == nil {
		models = []availableModel{}
	}

	c.JSON(http.StatusOK, map[string]any{"models": models})
}
