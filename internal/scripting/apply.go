package scripting

import (
	"strings"
)

type EditResult struct {
	Block      EditBlock
	Success    bool
	NewContent string
}

type ApplyResult struct {
	Applied []EditResult
	Failed  []EditResult
}

func ApplyEdits(
	blocks []EditBlock,
	getContent func(filename string) (string, bool),
) ApplyResult {
	var result ApplyResult
	overlay := make(map[string]string)

	for _, block := range blocks {
		if block.IsNewFile() {
			overlay[block.Filename] = block.Replace
			result.Applied = append(result.Applied, EditResult{
				Block:      block,
				Success:    true,
				NewContent: block.Replace,
			})
			continue
		}

		content, exists := overlay[block.Filename]
		if !exists {
			content, exists = getContent(block.Filename)
		}

		if !exists {
			result.Failed = append(result.Failed, EditResult{
				Block:   block,
				Success: false,
			})
			continue
		}

		newContent := applyOneEdit(content, block.Search, block.Replace)
		if newContent != "" {
			overlay[block.Filename] = newContent
			result.Applied = append(result.Applied, EditResult{
				Block:      block,
				Success:    true,
				NewContent: newContent,
			})
		} else {
			result.Failed = append(result.Failed, EditResult{
				Block:   block,
				Success: false,
			})
		}
	}

	return result
}

func applyOneEdit(content, search, replace string) string {
	if res := exactReplace(content, search, replace); res != "" {
		return res
	}

	if res := whitespaceFlexibleReplace(content, search, replace); res != "" {
		return res
	}

	if res := fuzzyReplace(content, search, replace); res != "" {
		return res
	}

	return ""
}

func exactReplace(content, search, replace string) string {
	search = normalizeEndings(search)
	replace = normalizeEndings(replace)
	normalized := normalizeEndings(content)

	if !strings.Contains(normalized, search) {
		return ""
	}
	return strings.Replace(normalized, search, replace, 1)
}

func whitespaceFlexibleReplace(content, search, replace string) string {
	contentLines := splitKeepEndings(normalizeEndings(content))
	searchLines := splitKeepEndings(normalizeEndings(search))
	replaceLines := splitKeepEndings(normalizeEndings(replace))

	if len(searchLines) == 0 {
		return ""
	}

	searchLeading := make([]string, len(searchLines))
	searchStripped := make([]string, len(searchLines))
	for i, l := range searchLines {
		trimmed := strings.TrimRight(l, "\n")
		stripped := strings.TrimLeft(trimmed, " \t")
		searchLeading[i] = trimmed[:len(trimmed)-len(stripped)]
		searchStripped[i] = stripped
	}

	minLeading := -1
	for _, l := range searchLeading {
		if strings.TrimSpace(
			searchStripped[searchLeading_indexOf(searchLeading, l)],
		) == "" {
			continue
		}
		if minLeading == -1 || len(l) < minLeading {
			minLeading = len(l)
		}
	}
	if minLeading < 0 {
		minLeading = 0
	}

	numSearch := len(searchLines)

	for i := 0; i <= len(contentLines)-numSearch; i++ {
		addLeading := matchIgnoringLeadingWhitespace(
			contentLines[i:i+numSearch],
			searchStripped,
		)
		if addLeading == "" && i <= len(contentLines)-numSearch {
			continue
		}
		if addLeading == "\x00" {
			addLeading = ""
		}

		adjustedReplace := make([]string, len(replaceLines))
		for j, rl := range replaceLines {
			trimmed := strings.TrimRight(rl, "\n")
			if strings.TrimSpace(trimmed) == "" {
				adjustedReplace[j] = rl
			} else {
				adjustedReplace[j] = addLeading + rl
			}
		}

		result := make(
			[]string,
			0,
			len(contentLines)-numSearch+len(adjustedReplace),
		)
		result = append(result, contentLines[:i]...)
		result = append(result, adjustedReplace...)
		result = append(result, contentLines[i+numSearch:]...)
		return strings.Join(result, "")
	}

	return ""
}

func searchLeading_indexOf(slice []string, target string) int {
	for i, s := range slice {
		if s == target {
			return i
		}
	}
	return 0
}

func matchIgnoringLeadingWhitespace(
	contentChunk, searchStripped []string,
) string {
	if len(contentChunk) != len(searchStripped) {
		return ""
	}

	var addLeading string
	first := true
	for i := range contentChunk {
		contentTrimmed := strings.TrimRight(contentChunk[i], "\n")
		contentStripped := strings.TrimLeft(contentTrimmed, " \t")

		if contentStripped != searchStripped[i] {
			return ""
		}

		if strings.TrimSpace(contentTrimmed) == "" {
			continue
		}

		leading := contentTrimmed[:len(contentTrimmed)-len(contentStripped)]
		if first {
			addLeading = leading
			first = true
		}
	}

	if first && addLeading == "" {
		return "\x00"
	}
	return addLeading
}

func fuzzyReplace(content, search, replace string) string {
	const similarityThreshold = 0.6

	contentLines := splitKeepEndings(normalizeEndings(content))
	searchLines := splitKeepEndings(normalizeEndings(search))
	replaceLines := splitKeepEndings(normalizeEndings(replace))

	if len(searchLines) == 0 || len(contentLines) == 0 {
		return ""
	}

	bestRatio := 0.0
	bestStart := -1

	scale := 0.1
	minLen := int(float64(len(searchLines)) * (1 - scale))
	maxLen := int(float64(len(searchLines)) * (1 + scale))
	if minLen < 1 {
		minLen = 1
	}
	if maxLen > len(contentLines) {
		maxLen = len(contentLines)
	}

	searchText := strings.Join(searchLines, "")

	for length := minLen; length <= maxLen; length++ {
		for i := 0; i <= len(contentLines)-length; i++ {
			chunk := strings.Join(contentLines[i:i+length], "")
			ratio := sequenceSimilarity(searchText, chunk)
			if ratio > bestRatio {
				bestRatio = ratio
				bestStart = i
			}
		}
	}

	if bestRatio < similarityThreshold || bestStart < 0 {
		return ""
	}

	bestLen := len(searchLines)
	if bestStart+bestLen > len(contentLines) {
		bestLen = len(contentLines) - bestStart
	}

	result := make([]string, 0, len(contentLines)-bestLen+len(replaceLines))
	result = append(result, contentLines[:bestStart]...)
	result = append(result, replaceLines...)
	result = append(result, contentLines[bestStart+bestLen:]...)
	return strings.Join(result, "")
}

func sequenceSimilarity(a, b string) float64 {
	if a == b {
		return 1.0
	}
	if len(a) == 0 || len(b) == 0 {
		return 0.0
	}

	lcsLen := longestCommonSubsequence(a, b)
	return 2.0 * float64(lcsLen) / float64(len(a)+len(b))
}

func longestCommonSubsequence(a, b string) int {
	m, n := len(a), len(b)

	if m > 500 || n > 500 {
		return lcsLines(a, b)
	}

	prev := make([]int, n+1)
	curr := make([]int, n+1)
	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if a[i-1] == b[j-1] {
				curr[j] = prev[j-1] + 1
			} else if prev[j] > curr[j-1] {
				curr[j] = prev[j]
			} else {
				curr[j] = curr[j-1]
			}
		}
		prev, curr = curr, prev
		for j := range curr {
			curr[j] = 0
		}
	}
	return prev[n]
}

func lcsLines(a, b string) int {
	aLines := strings.Split(a, "\n")
	bLines := strings.Split(b, "\n")
	m, n := len(aLines), len(bLines)
	prev := make([]int, n+1)
	curr := make([]int, n+1)
	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if aLines[i-1] == bLines[j-1] {
				curr[j] = prev[j-1] + 1
			} else if prev[j] > curr[j-1] {
				curr[j] = prev[j]
			} else {
				curr[j] = curr[j-1]
			}
		}
		prev, curr = curr, prev
		for j := range curr {
			curr[j] = 0
		}
	}
	return prev[n]
}

func normalizeEndings(s string) string {
	return strings.ReplaceAll(s, "\r\n", "\n")
}

func splitKeepEndings(s string) []string {
	if s == "" {
		return nil
	}
	raw := strings.SplitAfter(s, "\n")
	if len(raw) > 0 && raw[len(raw)-1] == "" {
		raw = raw[:len(raw)-1]
	}
	return raw
}

func FindSimilarLines(search, content string, threshold float64) string {
	searchLines := strings.Split(search, "\n")
	contentLines := strings.Split(content, "\n")

	if len(searchLines) == 0 || len(contentLines) == 0 {
		return ""
	}

	bestRatio := 0.0
	bestStart := 0

	for i := 0; i <= len(contentLines)-len(searchLines); i++ {
		chunk := contentLines[i : i+len(searchLines)]
		ratio := sequenceSimilarity(
			strings.Join(searchLines, "\n"),
			strings.Join(chunk, "\n"),
		)
		if ratio > bestRatio {
			bestRatio = ratio
			bestStart = i
		}
	}

	if bestRatio < threshold {
		return ""
	}

	padding := 5
	start := bestStart - padding
	if start < 0 {
		start = 0
	}
	end := bestStart + len(searchLines) + padding
	if end > len(contentLines) {
		end = len(contentLines)
	}

	return strings.Join(contentLines[start:end], "\n")
}
