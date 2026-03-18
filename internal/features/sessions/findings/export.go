package findings

import (
	"fmt"
	"strings"
	"time"

	"github.com/joakimcarlsson/juicebox/internal/db"
)

func buildMarkdownReport(findings []db.FindingRow) []byte {
	var b strings.Builder

	b.WriteString("# Security Findings Report\n\n")
	b.WriteString(
		fmt.Sprintf(
			"Generated: %s\n\n",
			time.Now().Format("2006-01-02 15:04:05"),
		),
	)

	counts := map[string]int{}
	for _, f := range findings {
		counts[f.Severity]++
	}
	b.WriteString("## Summary\n\n")
	b.WriteString("| Severity | Count |\n|----------|-------|\n")
	for _, sev := range []string{"critical", "high", "medium", "low", "info"} {
		if n := counts[sev]; n > 0 {
			b.WriteString(fmt.Sprintf("| %s | %d |\n", strings.Title(sev), n))
		}
	}
	b.WriteString("\n")

	if len(findings) == 0 {
		b.WriteString("No findings recorded.\n")
		return []byte(b.String())
	}

	b.WriteString("## Findings\n\n")
	for i, f := range findings {
		b.WriteString(
			fmt.Sprintf(
				"### %d. [%s] %s\n\n",
				i+1,
				strings.ToUpper(f.Severity),
				f.Title,
			),
		)
		if f.Description != "" {
			b.WriteString(f.Description)
			b.WriteString("\n\n")
		}
		ts := time.UnixMilli(f.CreatedAt).Format("2006-01-02 15:04:05")
		b.WriteString(fmt.Sprintf("*Created: %s*\n\n---\n\n", ts))
	}

	return []byte(b.String())
}
