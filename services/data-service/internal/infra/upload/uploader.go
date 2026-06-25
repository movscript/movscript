package upload

import "context"

type UploadResult struct {
	FileID string
	URL    string
}

type Uploader interface {
	Upload(ctx context.Context, data []byte, filename, mimeType string) (UploadResult, error)
	Type() string
}
