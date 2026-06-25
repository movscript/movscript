package main

import (
	"encoding/csv"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type registryFile struct {
	Lab       string           `yaml:"lab"`
	Templates []templateSource `yaml:"templates"`
}

type templateSource struct {
	ID           string         `yaml:"id"`
	Lab          string         `yaml:"lab"`
	ModelID      string         `yaml:"model_id"`
	DisplayName  string         `yaml:"display_name"`
	AdapterType  string         `yaml:"adapter_type"`
	Capabilities []string       `yaml:"capabilities"`
	Source       sourceEvidence `yaml:"source"`
}

type sourceEvidence struct {
	URL        string `yaml:"url"`
	VerifiedAt string `yaml:"verified_at"`
	Status     string `yaml:"status"`
}

type finding struct {
	Level      string
	Lab        string
	TemplateID string
	ModelID    string
	Source     string
	Message    string
}

func main() {
	infraDir := defaultAIInfraDir()
	sourceDir := flag.String("source", filepath.Join(infraDir, "model_registry", "labs"), "directory containing lab YAML files")
	format := flag.String("format", "text", "output format: text or csv")
	maxAge := flag.Int("max-verified-age-days", 90, "warn when verified_at is older than this many days")
	failOnWarning := flag.Bool("fail-on-warning", false, "exit non-zero when warnings are found")
	flag.Parse()

	templates, err := loadTemplates(*sourceDir)
	if err != nil {
		fatal(err)
	}
	findings := auditTemplates(templates, *maxAge)
	if err := writeFindings(os.Stdout, findings, *format); err != nil {
		fatal(err)
	}
	if *failOnWarning && hasWarning(findings) {
		os.Exit(1)
	}
}

func defaultAIInfraDir() string {
	if _, err := os.Stat(filepath.Join("internal", "infra", "ai", "catalog.go")); err == nil {
		return filepath.Join("internal", "infra", "ai")
	}
	return "."
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func loadTemplates(sourceDir string) ([]templateSource, error) {
	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	var out []templateSource
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}
		path := filepath.Join(sourceDir, entry.Name())
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		var file registryFile
		if err := yaml.Unmarshal(raw, &file); err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		for _, template := range file.Templates {
			if template.Lab == "" {
				template.Lab = file.Lab
			}
			out = append(out, template)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Lab == out[j].Lab {
			return out[i].ID < out[j].ID
		}
		return out[i].Lab < out[j].Lab
	})
	return out, nil
}

func auditTemplates(templates []templateSource, maxAgeDays int) []finding {
	now := time.Now()
	var findings []finding
	for _, template := range templates {
		sourceURL := strings.TrimSpace(template.Source.URL)
		status := strings.TrimSpace(template.Source.Status)
		switch status {
		case "verified":
			verifiedAt, err := time.Parse("2006-01-02", strings.TrimSpace(template.Source.VerifiedAt))
			if err != nil {
				findings = append(findings, findingFor(template, "error", sourceURL, "verified_at is not a valid YYYY-MM-DD date"))
			} else if maxAgeDays > 0 && now.Sub(verifiedAt) > time.Duration(maxAgeDays)*24*time.Hour {
				findings = append(findings, findingFor(template, "warning", sourceURL, fmt.Sprintf("official verification is older than %d days", maxAgeDays)))
			}
		case "needs_review":
			findings = append(findings, findingFor(template, "warning", sourceURL, "official parameters still need review"))
		case "deprecated":
			findings = append(findings, findingFor(template, "info", sourceURL, "template is marked deprecated"))
		case "unofficial":
			findings = append(findings, findingFor(template, "warning", sourceURL, "template has no official source"))
		default:
			findings = append(findings, findingFor(template, "error", sourceURL, "source.status is invalid or missing"))
		}
		if sourceURL == "" {
			findings = append(findings, findingFor(template, "error", sourceURL, "source.url is missing"))
		}
	}
	return findings
}

func findingFor(template templateSource, level, source, message string) finding {
	return finding{
		Level:      level,
		Lab:        template.Lab,
		TemplateID: template.ID,
		ModelID:    template.ModelID,
		Source:     source,
		Message:    message,
	}
}

func writeFindings(out *os.File, findings []finding, format string) error {
	switch format {
	case "csv":
		writer := csv.NewWriter(out)
		if err := writer.Write([]string{"level", "lab", "template_id", "model_id", "source", "message"}); err != nil {
			return err
		}
		for _, finding := range findings {
			if err := writer.Write([]string{finding.Level, finding.Lab, finding.TemplateID, finding.ModelID, finding.Source, finding.Message}); err != nil {
				return err
			}
		}
		writer.Flush()
		return writer.Error()
	case "text":
		counts := map[string]int{}
		for _, finding := range findings {
			counts[finding.Level]++
		}
		fmt.Fprintf(out, "model registry audit: %d findings (error=%d warning=%d info=%d)\n", len(findings), counts["error"], counts["warning"], counts["info"])
		for _, finding := range findings {
			fmt.Fprintf(out, "%-7s %-18s %-38s %-34s %s\n", finding.Level, finding.Lab, finding.TemplateID, finding.ModelID, finding.Message)
		}
		return nil
	default:
		return fmt.Errorf("unsupported format %q", format)
	}
}

func hasWarning(findings []finding) bool {
	for _, finding := range findings {
		if finding.Level == "error" || finding.Level == "warning" {
			return true
		}
	}
	return false
}
