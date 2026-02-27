package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joakimcarlsson/ai/model"
	llm "github.com/joakimcarlsson/ai/providers"
	"github.com/joho/godotenv"
)

type Config struct {
	LLM LLMConfig
}

type LLMConfig struct {
	Provider string
	APIKey   string
	Model    string
	BaseURL  string
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		LLM: LLMConfig{
			Provider: os.Getenv("JUICEBOX_LLM_PROVIDER"),
			APIKey:   os.Getenv("JUICEBOX_LLM_API_KEY"),
			Model:    os.Getenv("JUICEBOX_LLM_MODEL"),
			BaseURL:  os.Getenv("JUICEBOX_LLM_BASE_URL"),
		},
	}
}

func (c *LLMConfig) Configured() bool {
	return c.Provider != ""
}

func (c *LLMConfig) NewClient() (llm.LLM, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("LLM provider not configured")
	}

	provider := strings.ToLower(c.Provider)

	var opts []llm.LLMClientOption
	if c.APIKey != "" {
		opts = append(opts, llm.WithAPIKey(c.APIKey))
	}

	switch provider {
	case "openai":
		m := resolveModel(c.Model, model.OpenAIModels, model.GPT52Codex)
		opts = append(
			opts,
			llm.WithModel(m),
			llm.WithMaxTokens(m.DefaultMaxTokens),
		)
		return llm.NewLLM(model.ProviderOpenAI, opts...)

	case "anthropic":
		m := resolveModel(c.Model, model.AnthropicModels, model.Claude45Haiku)
		opts = append(
			opts,
			llm.WithModel(m),
			llm.WithMaxTokens(m.DefaultMaxTokens),
		)
		return llm.NewLLM(model.ProviderAnthropic, opts...)

	case "ollama":
		baseURL := c.BaseURL
		if baseURL == "" {
			baseURL = "http://localhost:11434/v1"
		}
		modelID := c.Model
		if modelID == "" {
			modelID = "llama3.2"
		}
		ollamaModel := model.NewCustomModel(
			model.WithModelID(model.ModelID(modelID)),
			model.WithAPIModel(modelID),
			model.WithContextWindow(128_000),
		)
		ollamaProvider := llm.RegisterCustomProvider(
			"ollama",
			llm.CustomProviderConfig{
				BaseURL:      baseURL,
				DefaultModel: ollamaModel,
			},
		)
		opts = append(opts, llm.WithMaxTokens(4096))
		return llm.NewLLM(ollamaProvider, opts...)

	default:
		return nil, fmt.Errorf(
			"unsupported LLM provider: %s (supported: openai, anthropic, ollama)",
			provider,
		)
	}
}

func resolveModel(
	override string,
	models map[model.ModelID]model.Model,
	fallback model.ModelID,
) model.Model {
	if override != "" {
		if m, ok := models[model.ModelID(override)]; ok {
			return m
		}
	}
	return models[fallback]
}
