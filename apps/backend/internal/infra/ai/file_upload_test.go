package ai

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestRegistryLocalFileUploaderUsesCredentialFilesAPIKey(t *testing.T) {
	var gotAuth string
	server := testutil.NewHTTPTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/files" {
			t.Fatalf("unexpected files API request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"id":"file-local","object":"file","bytes":5,"created_at":1,"filename":"image.png","purpose":"vision","status":"uploaded"}`)
	}))
	defer server.Close()

	key := []byte(strings.Repeat("1", 32))
	encryptedMain, err := crypto.Encrypt("main-key", key)
	if err != nil {
		t.Fatalf("encrypt main key: %v", err)
	}
	encryptedFiles, err := crypto.Encrypt("files-key", key)
	if err != nil {
		t.Fatalf("encrypt files key: %v", err)
	}
	db := testutil.OpenSQLite(t, "ai-file-uploader-local.db", &persistencemodel.AICredential{}, &persistencemodel.AIModelConfig{})
	cred := persistencemodel.AICredential{
		Model:                gorm.Model{ID: 7},
		AdapterType:          AdapterOpenAICompat,
		DisplayName:          "OpenAI files",
		BaseURL:              "https://legacy.example/v1",
		EncryptedKey:         encryptedMain,
		FilesAPIEnabled:      true,
		FilesAPIBaseURL:      server.URL + "/v1",
		FilesAPIEncryptedKey: encryptedFiles,
		IsEnabled:            true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	cfg := persistencemodel.AIModelConfig{CredentialID: cred.ID}

	uploader := NewRegistry(db, key).GetFileUploader(context.Background(), 42, cfg)
	if uploader == nil {
		t.Fatal("GetFileUploader() returned nil for enabled files API credential")
	}
	if _, err := uploader.UploadFile(context.Background(), []byte("image"), "image.png", "image/png", ""); err != nil {
		t.Fatalf("UploadFile() error = %v", err)
	}
	if gotAuth != "Bearer files-key" {
		t.Fatalf("files API auth = %q, want independent files key", gotAuth)
	}
}
