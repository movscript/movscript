package media

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// NormalizeVideoForBrowser rewrites videos to a Chromium-friendly MP4 profile.
// If ffmpeg is not installed, it returns the original bytes unchanged.
func NormalizeVideoForBrowser(ctx context.Context, data []byte, mimeType string) ([]byte, string, bool, error) {
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(mimeType)), "video/") {
		return data, mimeType, false, nil
	}

	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return data, mimeType, false, nil
		}
		return data, mimeType, false, fmt.Errorf("find ffmpeg: %w", err)
	}

	dir, err := os.MkdirTemp("", "movscript-video-*")
	if err != nil {
		return data, mimeType, false, fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(dir)

	input := filepath.Join(dir, "input")
	output := filepath.Join(dir, "output.mp4")
	if err := os.WriteFile(input, data, 0600); err != nil {
		return data, mimeType, false, fmt.Errorf("write temp video: %w", err)
	}

	cmd := exec.CommandContext(ctx, ffmpeg,
		"-y",
		"-hide_banner",
		"-loglevel", "error",
		"-i", input,
		"-map", "0:v:0",
		"-map", "0:a?",
		"-c:v", "libx264",
		"-pix_fmt", "yuv420p",
		"-preset", "veryfast",
		"-movflags", "+faststart",
		"-c:a", "aac",
		"-b:a", "128k",
		output,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return data, mimeType, false, fmt.Errorf("transcode video: %w: %s", err, strings.TrimSpace(string(out)))
	}

	normalized, err := os.ReadFile(output)
	if err != nil {
		return data, mimeType, false, fmt.Errorf("read transcoded video: %w", err)
	}
	return normalized, "video/mp4", true, nil
}

func MP4Name(name string) string {
	base := strings.TrimSuffix(name, filepath.Ext(name))
	if base == "" {
		base = "video"
	}
	return base + ".mp4"
}
