package scripting

import (
	"fmt"
	"strings"
)

func BuildEditError(results ApplyResult, getContent func(filename string) (string, bool)) string {
	if len(results.Failed) == 0 {
		return ""
	}

	blocks := "block"
	if len(results.Failed) > 1 {
		blocks = "blocks"
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "# %d SEARCH/REPLACE %s failed to match!\n", len(results.Failed), blocks)

	for _, fail := range results.Failed {
		fmt.Fprintf(&sb, "\n## SearchReplaceNoExactMatch: This SEARCH block failed to exactly match lines in %s\n", fail.Block.Filename)
		fmt.Fprintf(&sb, "<<<<<<< SEARCH\n%s=======\n%s>>>>>>> REPLACE\n\n", ensureNewline(fail.Block.Search), ensureNewline(fail.Block.Replace))

		content, exists := getContent(fail.Block.Filename)
		if exists {
			similar := FindSimilarLines(fail.Block.Search, content, 0.4)
			if similar != "" {
				fmt.Fprintf(&sb, "Did you mean to match some of these actual lines from %s?\n\n```\n%s\n```\n\n", fail.Block.Filename, similar)
			}

			if fail.Block.Replace != "" && strings.Contains(content, strings.TrimSpace(fail.Block.Replace)) {
				fmt.Fprintf(&sb, "Are you sure you need this SEARCH/REPLACE block?\nThe REPLACE lines are already in %s!\n\n", fail.Block.Filename)
			}
		}
	}

	sb.WriteString("The SEARCH section must exactly match an existing block of lines including all white space, comments, indentation, etc\n")

	if len(results.Applied) > 0 {
		pblocks := "block"
		if len(results.Applied) > 1 {
			pblocks = "blocks"
		}
		fmt.Fprintf(&sb, "\n# The other %d SEARCH/REPLACE %s were applied successfully.\nDon't re-send them.\nJust reply with fixed versions of the %s above that failed to match.\n", len(results.Applied), pblocks, blocks)
	}

	return sb.String()
}

func ensureNewline(s string) string {
	if s == "" {
		return s
	}
	if !strings.HasSuffix(s, "\n") {
		return s + "\n"
	}
	return s
}
