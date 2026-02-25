package scripting

import (
	"regexp"
	"strings"
)

type EditBlock struct {
	Filename string
	Search   string
	Replace  string
}

func (e EditBlock) IsNewFile() bool {
	return strings.TrimSpace(e.Search) == ""
}

var (
	headPattern    = regexp.MustCompile(`^<{5,9} SEARCH>?\s*$`)
	dividerPattern = regexp.MustCompile(`^={5,9}\s*$`)
	updatedPattern = regexp.MustCompile(`^>{5,9} REPLACE\s*$`)
	fenceOpen      = regexp.MustCompile(`^` + "```" + `\w+\s*$`)
	fenceClose     = regexp.MustCompile(`^` + "```" + `\s*$`)
)

func ParseEditBlocks(content string) []EditBlock {
	lines := strings.SplitAfter(content, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}

	var blocks []EditBlock
	i := 0
	var currentFilename string

	for i < len(lines) {
		line := strings.TrimRight(lines[i], "\r\n")

		if headPattern.MatchString(line) {
			filename := findFilename(lines, i)
			if filename != "" {
				currentFilename = filename
			}
			if currentFilename == "" {
				i++
				continue
			}

			i++
			var searchLines []string
			for i < len(lines) {
				stripped := strings.TrimRight(lines[i], "\r\n")
				if dividerPattern.MatchString(stripped) {
					break
				}
				searchLines = append(searchLines, lines[i])
				i++
			}

			if i >= len(lines) {
				break
			}

		i++
		var replaceLines []string
		for i < len(lines) {
			stripped := strings.TrimRight(lines[i], "\r\n")
			if updatedPattern.MatchString(stripped) {
				break
			}
			replaceLines = append(replaceLines, lines[i])
			i++
		}

		complete := i < len(lines) && updatedPattern.MatchString(strings.TrimRight(lines[i], "\r\n"))
		if !complete {
			break
		}
		i++

		blocks = append(blocks, EditBlock{
			Filename: currentFilename,
			Search:   joinLines(searchLines),
			Replace:  joinLines(replaceLines),
		})
		continue
		}

		if fenceOpen.MatchString(line) {
			filename := findFilename(lines, i)
			if filename != "" {
				bodyStart := i + 1
				j := bodyStart
				for j < len(lines) {
					if fenceClose.MatchString(strings.TrimRight(lines[j], "\r\n")) {
						break
					}
					j++
				}
				if j > bodyStart && j < len(lines) {
					hasMarkers := false
					for k := bodyStart; k < j && k < bodyStart+3; k++ {
						s := strings.TrimRight(lines[k], "\r\n")
						if headPattern.MatchString(s) {
							hasMarkers = true
							break
						}
					}
					if !hasMarkers {
						blocks = append(blocks, EditBlock{
							Filename: filename,
							Search:   "",
							Replace:  joinLines(lines[bodyStart:j]),
						})
						i = j + 1
						continue
					}
				}
			}
		}

		i++
	}

	return blocks
}

func findFilename(lines []string, headIdx int) string {
	lookback := 3
	start := headIdx - lookback
	if start < 0 {
		start = 0
	}

	for j := headIdx - 1; j >= start; j-- {
		line := strings.TrimRight(lines[j], "\r\n")

		if strings.HasPrefix(line, "```") {
			lang := strings.TrimPrefix(line, "```")
			lang = strings.TrimSpace(lang)
			if lang != "" && !strings.Contains(lang, " ") && !strings.Contains(lang, "/") && !strings.Contains(lang, ".") {
				continue
			}
			if strings.Contains(lang, ".") || strings.Contains(lang, "/") {
				return lang
			}
			continue
		}

		candidate := stripFilenameDecorations(line)
		if candidate != "" && looksLikeFilename(candidate) {
			return candidate
		}
	}

	return ""
}

func stripFilenameDecorations(line string) string {
	s := strings.TrimSpace(line)
	s = strings.TrimRight(s, ":")
	s = strings.TrimLeft(s, "#")
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "`")
	s = strings.Trim(s, "*")
	s = strings.Trim(s, "'\"")
	return s
}

func looksLikeFilename(s string) bool {
	if s == "" || strings.Contains(s, " ") {
		return false
	}
	if strings.ContainsAny(s, "(){}[];=<>!&|,") {
		return false
	}
	return strings.Contains(s, ".") || strings.Contains(s, "/")
}

func joinLines(lines []string) string {
	if len(lines) == 0 {
		return ""
	}
	return strings.Join(lines, "")
}
