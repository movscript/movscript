package ai

import (
	"bytes"
	"context"
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
)

// FileUploader uploads a file to an OpenAI-compatible Files API endpoint and returns the file ID.
type FileUploader struct {
	client openai.Client
}

func NewFileUploader(baseURL, apiKey string) *FileUploader {
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	return &FileUploader{
		client: openai.NewClient(
			option.WithAPIKey(apiKey),
			option.WithBaseURL(baseURL),
		),
	}
}

// UploadFile uploads raw bytes to POST /files and returns the provider file ID.
func (u *FileUploader) UploadFile(ctx context.Context, data []byte, filename, mimeType, purpose string) (string, error) {
	if purpose == "" {
		purpose = "vision"
	}
	f, err := u.client.Files.New(ctx, openai.FileNewParams{
		File:    bytes.NewReader(data),
		Purpose: openai.FilePurpose(purpose),
	})
	if err != nil {
		return "", fmt.Errorf("upload file: %w", err)
	}
	if f.ID == "" {
		return "", fmt.Errorf("files API returned no file ID")
	}
	return f.ID, nil
}

// DeleteFile removes a file from the provider's Files API.
func (u *FileUploader) DeleteFile(ctx context.Context, fileID string) error {
	_, err := u.client.Files.Delete(ctx, fileID)
	return err
}
