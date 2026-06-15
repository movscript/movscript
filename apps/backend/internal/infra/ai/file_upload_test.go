package ai

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/infra/crypto"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestRegistryNewAPIFileUploaderUsesRelayToken(t *testing.T) {
	var gotUploadAuth string
	var gotUploadPath string
	var gotPurpose string
	var gotDeleteAuth string
	var gotDeletePath string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/files":
			gotUploadAuth = r.Header.Get("Authorization")
			gotUploadPath = r.URL.Path
			if err := r.ParseMultipartForm(8 << 20); err != nil {
				t.Fatalf("ParseMultipartForm() error = %v", err)
			}
			gotPurpose = r.FormValue("purpose")
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"id":"file-newapi","object":"file","bytes":10,"created_at":1,"filename":"image.png","purpose":"vision","status":"uploaded"}`)
		case r.Method == http.MethodDelete && r.URL.Path == "/v1/files/file-newapi":
			gotDeleteAuth = r.Header.Get("Authorization")
			gotDeletePath = r.URL.Path
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"id":"file-newapi","object":"file","deleted":true}`)
		default:
			t.Fatalf("unexpected files API request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()
	t.Setenv("MOVSCRIPT_NEW_API_BASE_URL", server.URL)
	t.Setenv("MOVSCRIPT_NEW_API_RELAY_TOKEN", "relay-token")

	registry := NewRegistryWithProviderMode(nil, nil, "new-api")
	uploader := registry.GetFileUploader(context.Background(), 42, persistencemodel.AIModelConfig{})
	if uploader == nil {
		t.Fatal("GetFileUploader() returned nil in new-api mode")
	}
	fileID, err := uploader.UploadFile(context.Background(), []byte("image-data"), "image.png", "image/png", "")
	if err != nil {
		t.Fatalf("UploadFile() error = %v", err)
	}
	if fileID != "file-newapi" {
		t.Fatalf("file id = %q, want file-newapi", fileID)
	}
	if err := uploader.DeleteFile(context.Background(), fileID); err != nil {
		t.Fatalf("DeleteFile() error = %v", err)
	}
	if gotUploadPath != "/v1/files" || gotDeletePath != "/v1/files/file-newapi" {
		t.Fatalf("files API paths upload=%q delete=%q", gotUploadPath, gotDeletePath)
	}
	if gotUploadAuth != "Bearer sk-relay-token" || gotDeleteAuth != "Bearer sk-relay-token" {
		t.Fatalf("files API auth upload=%q delete=%q, want new-api relay token", gotUploadAuth, gotDeleteAuth)
	}
	if gotPurpose != "vision" {
		t.Fatalf("purpose = %q, want default vision", gotPurpose)
	}
}

func TestRegistryLocalFileUploaderUsesCredentialFilesAPIKey(t *testing.T) {
	var gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
