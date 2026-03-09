package chat

import _ "embed"

//go:embed prompt.md
var SystemPromptTemplate string

//go:embed frida_instrumentation_prompt.md
var FridaInstrumentationPromptTemplate string

//go:embed traffic_analyst_prompt.md
var TrafficAnalystPromptTemplate string

//go:embed filesystem_analyst_prompt.md
var FilesystemAnalystPromptTemplate string
