package semantic

import (
	"context"
	"errors"
	"strconv"
	"strings"

	domainsemantic "github.com/movscript/movscript/internal/domain/semantic"
)

func (s *Service) ListScriptVersions(ctx context.Context, filter ScriptVersionFilter) ([]domainsemantic.ScriptVersion, error) {
	return s.repo.ListScriptVersions(ctx, filter)
}

func (s *Service) CreateScriptVersion(ctx context.Context, projectID uint, input CreateScriptVersionInput, createdByID *uint) (domainsemantic.ScriptVersion, error) {
	item, err := s.repo.CreateScriptVersion(ctx, projectID, input, createdByID)
	if err != nil {
		return item, err
	}
	s.bumpProgressVersion(ctx, projectID)
	return item, nil
}

func (s *Service) PatchScriptVersion(ctx context.Context, projectID uint, id string, input PatchScriptVersionInput) (domainsemantic.ScriptVersion, error) {
	return domainsemantic.ScriptVersion{}, ErrForbidden{Message: "剧本版本创建后不可修改，请新建一个新版本"}
}

func (s *Service) ListScriptVersionLines(ctx context.Context, projectID uint, id string) ([]ScriptVersionLine, error) {
	version, err := s.repo.LoadScriptVersion(ctx, projectID, id)
	if err != nil {
		return nil, err
	}
	source := scriptVersionSourceText(version)
	if strings.TrimSpace(source) == "" {
		return []ScriptVersionLine{}, nil
	}
	rawLines := strings.Split(source, "\n")
	lines := make([]ScriptVersionLine, 0, len(rawLines))
	for index, line := range rawLines {
		lines = append(lines, ScriptVersionLine{
			LineNumber: index + 1,
			Content:    line,
			StartChar:  0,
			EndChar:    len([]rune(line)),
		})
	}
	return lines, nil
}

func (s *Service) nextScriptVersionNumber(ctx context.Context, projectID uint, scriptID uint) int {
	return s.repo.NextScriptVersionNumber(ctx, projectID, scriptID)
}

func (s *Service) ListScriptBlocks(ctx context.Context, filter ScriptBlockFilter) ([]domainsemantic.ScriptBlock, error) {
	return s.repo.ListScriptBlocks(ctx, filter)
}

func (s *Service) CreateScriptBlock(ctx context.Context, projectID uint, input CreateScriptBlockInput) (domainsemantic.ScriptBlock, error) {
	version, err := s.validateScriptBlockOwners(ctx, projectID, input.ScriptID, input.ScriptVersionID, input.ParentBlockID)
	if err != nil {
		return domainsemantic.ScriptBlock{}, err
	}
	content, startLine, endLine, startChar, endChar, err := scriptBlockSourceFromVersion(version, input)
	if err != nil {
		return domainsemantic.ScriptBlock{}, err
	}
	item := domainsemantic.NewScriptBlock(domainsemantic.ScriptBlockSpec{
		ProjectID:       projectID,
		ScriptID:        input.ScriptID,
		ScriptVersionID: input.ScriptVersionID,
		ParentBlockID:   input.ParentBlockID,
		Order:           input.Order,
		Kind:            input.Kind,
		Speaker:         input.Speaker,
		Content:         content,
		StartLine:       startLine,
		EndLine:         endLine,
		StartChar:       startChar,
		EndChar:         endChar,
		Status:          input.Status,
		MetadataJSON:    input.MetadataJSON,
	})
	return s.repo.CreateScriptBlock(ctx, item)
}

func (s *Service) PatchScriptBlock(ctx context.Context, projectID uint, id string, input PatchScriptBlockInput) (domainsemantic.ScriptBlock, error) {
	item, err := s.repo.LoadScriptBlock(ctx, projectID, id)
	if err != nil {
		return item, err
	}
	if input.ParentBlockID != nil {
		if _, err := s.validateScriptBlockOwners(ctx, projectID, item.ScriptID, item.ScriptVersionID, input.ParentBlockID); err != nil {
			return item, err
		}
	}
	patch := domainsemantic.ScriptBlockPatch{
		ParentBlockID: input.ParentBlockID,
		Order:         input.Order,
		Kind:          input.Kind,
		Speaker:       input.Speaker,
		Status:        input.Status,
		MetadataJSON:  input.MetadataJSON,
	}
	return s.repo.PatchScriptBlock(ctx, item, patch)
}

func (s *Service) validateScriptBlockOwners(ctx context.Context, projectID uint, scriptID uint, scriptVersionID uint, parentBlockID *uint) (domainsemantic.ScriptVersion, error) {
	if scriptID == 0 || scriptVersionID == 0 {
		return domainsemantic.ScriptVersion{}, ErrInvalidInput{Err: errors.New("script_id and script_version_id are required")}
	}
	version, err := s.repo.LoadScriptVersion(ctx, projectID, strconv.FormatUint(uint64(scriptVersionID), 10))
	if err != nil {
		return domainsemantic.ScriptVersion{}, err
	}
	if version.ScriptID != scriptID {
		return domainsemantic.ScriptVersion{}, ErrOwnerWrongProject
	}
	if parentBlockID != nil {
		parent, err := s.repo.LoadScriptBlock(ctx, projectID, strconv.FormatUint(uint64(*parentBlockID), 10))
		if err != nil {
			return domainsemantic.ScriptVersion{}, err
		}
		if parent.ScriptID != scriptID || parent.ScriptVersionID != scriptVersionID {
			return domainsemantic.ScriptVersion{}, ErrOwnerWrongProject
		}
	}
	return version, nil
}

func scriptVersionSourceText(version domainsemantic.ScriptVersion) string {
	source := normalizeScriptSource(version.Content)
	if strings.TrimSpace(source) == "" {
		source = normalizeScriptSource(version.RawSource)
	}
	return source
}

func scriptBlockSourceFromVersion(version domainsemantic.ScriptVersion, input CreateScriptBlockInput) (string, int, int, int, int, error) {
	source := scriptVersionSourceText(version)
	if strings.TrimSpace(source) == "" {
		return "", 0, 0, 0, 0, ErrInvalidInput{Err: errors.New("script version has no source text")}
	}
	lines := strings.Split(source, "\n")
	startLine := input.StartLine
	endLine := input.EndLine
	if startLine <= 0 || endLine <= 0 || startLine > endLine || startLine > len(lines) || endLine > len(lines) {
		return "", 0, 0, 0, 0, ErrInvalidInput{Err: errors.New("script block line range is outside script version")}
	}
	if input.StartChar < 0 || input.EndChar < 0 {
		return "", 0, 0, 0, 0, ErrInvalidInput{Err: errors.New("script block character range is invalid")}
	}

	startChar := input.StartChar
	endChar := input.EndChar
	if startChar == 0 && endChar == 0 {
		precise, preciseErr := extractScriptBlockText(lines, startLine, endLine, startChar, endChar)
		if preciseErr == nil && input.Content != "" && normalizeScriptSource(input.Content) == precise {
			if strings.TrimSpace(precise) == "" {
				return "", 0, 0, 0, 0, ErrInvalidInput{Err: errors.New("script block source text is empty")}
			}
			return precise, startLine, endLine, startChar, endChar, nil
		}
		startChar = 0
		endChar = len([]rune(lines[endLine-1]))
	}

	content, err := extractScriptBlockText(lines, startLine, endLine, startChar, endChar)
	if err != nil {
		return "", 0, 0, 0, 0, err
	}
	if strings.TrimSpace(content) == "" {
		return "", 0, 0, 0, 0, ErrInvalidInput{Err: errors.New("script block source text is empty")}
	}
	return content, startLine, endLine, startChar, endChar, nil
}

func normalizeScriptSource(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	return strings.ReplaceAll(text, "\r", "\n")
}

func extractScriptBlockText(lines []string, startLine int, endLine int, startChar int, endChar int) (string, error) {
	first := []rune(lines[startLine-1])
	last := []rune(lines[endLine-1])
	if startChar > len(first) || endChar > len(last) {
		return "", ErrInvalidInput{Err: errors.New("script block character range is outside script version line")}
	}
	if startLine == endLine {
		if startChar >= endChar {
			return "", ErrInvalidInput{Err: errors.New("script block character range is empty")}
		}
		return string(first[startChar:endChar]), nil
	}

	parts := make([]string, 0, endLine-startLine+1)
	parts = append(parts, string(first[startChar:]))
	for line := startLine + 1; line < endLine; line++ {
		parts = append(parts, lines[line-1])
	}
	parts = append(parts, string(last[:endChar]))
	return strings.Join(parts, "\n"), nil
}
