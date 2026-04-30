package scriptanalysis

import "strings"

const defaultMaxChunkRunes = 9000

type Chunk struct {
	Index int
	Total int
	Text  string
}

func ChunkText(content string, maxRunes int) []Chunk {
	if maxRunes <= 0 {
		maxRunes = defaultMaxChunkRunes
	}
	lines := strings.Split(strings.TrimSpace(content), "\n")
	parts := make([]string, 0)
	var current strings.Builder
	for _, line := range lines {
		lineRunes := len([]rune(line))
		currentRunes := len([]rune(current.String()))
		if currentRunes > 0 && currentRunes+lineRunes+1 > maxRunes {
			parts = append(parts, strings.TrimSpace(current.String()))
			current.Reset()
		}
		if lineRunes > maxRunes {
			for _, segment := range splitLongLine(line, maxRunes) {
				if strings.TrimSpace(segment) == "" {
					continue
				}
				if current.Len() > 0 {
					parts = append(parts, strings.TrimSpace(current.String()))
					current.Reset()
				}
				parts = append(parts, segment)
			}
			continue
		}
		if current.Len() > 0 {
			current.WriteString("\n")
		}
		current.WriteString(line)
	}
	if strings.TrimSpace(current.String()) != "" {
		parts = append(parts, strings.TrimSpace(current.String()))
	}

	chunks := make([]Chunk, 0, len(parts))
	for i, part := range parts {
		chunks = append(chunks, Chunk{Index: i + 1, Total: len(parts), Text: part})
	}
	return chunks
}

func splitLongLine(line string, maxRunes int) []string {
	runes := []rune(line)
	parts := make([]string, 0, len(runes)/maxRunes+1)
	for start := 0; start < len(runes); start += maxRunes {
		end := start + maxRunes
		if end > len(runes) {
			end = len(runes)
		}
		parts = append(parts, string(runes[start:end]))
	}
	return parts
}
