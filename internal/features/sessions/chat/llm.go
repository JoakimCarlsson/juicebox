package chat

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/model"
	llm "github.com/joakimcarlsson/ai/providers"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

var modelRegistry = map[model.ModelID]model.Model{}

var modelProviderKeyMap = map[model.ModelProvider]string{
	model.ProviderOpenAI:    "api_key_openai",
	model.ProviderAnthropic: "api_key_anthropic",
	model.ProviderGemini:    "api_key_google",
}

func init() {
	for id, m := range model.OpenAIModels {
		modelRegistry[id] = m
	}
	for id, m := range model.AnthropicModels {
		modelRegistry[id] = m
	}
	for id, m := range model.GeminiModels {
		modelRegistry[id] = m
	}
}

func newLLMClient(
	ctx context.Context,
	database *db.DB,
	modelID string,
) (llm.LLM, error) {
	m, ok := modelRegistry[model.ModelID(modelID)]
	if !ok {
		return nil, fmt.Errorf("unknown model: %s", modelID)
	}

	settingKey, ok := modelProviderKeyMap[m.Provider]
	if !ok {
		return nil, fmt.Errorf("unsupported provider: %s", m.Provider)
	}

	apiKey, err := database.GetSetting(ctx, settingKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read API key: %w", err)
	}
	if apiKey == "" {
		return nil, fmt.Errorf("no API key configured for %s", m.Provider)
	}

	return llm.NewLLM(m.Provider,
		llm.WithAPIKey(apiKey),
		llm.WithModel(m),
		llm.WithMaxTokens(m.DefaultMaxTokens),
	)
}

func hasAnyProviderKey(ctx context.Context, database *db.DB) bool {
	for _, key := range modelProviderKeyMap {
		v, err := database.GetSetting(ctx, key)
		if err == nil && v != "" {
			return true
		}
	}
	return false
}
