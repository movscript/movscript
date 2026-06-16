package audio

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/movscript/movscript/internal/infra/ai"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"github.com/movscript/movscript/internal/infra/storage"
	"github.com/movscript/movscript/internal/testutil"
	"gorm.io/gorm"
)

func TestAlignLoadsAudioResourceAndCallsSubtitleAlignModel(t *testing.T) {
	var gotPath, gotModel, gotLanguage string
	var gotAudio []byte
	server := testutil.NewHTTPTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("parse multipart form: %v", err)
		}
		gotModel = r.FormValue("model")
		gotLanguage = r.FormValue("language")
		file, _, err := r.FormFile("file")
		if err != nil {
			t.Fatalf("multipart file: %v", err)
		}
		defer file.Close()
		gotAudio, _ = io.ReadAll(file)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"text":"hello world","language":"en"}`)
	}))
	defer server.Close()

	db := testutil.OpenSQLite(t, "app-audio-align.db",
		&persistencemodel.AICredential{},
		&persistencemodel.AIModelConfig{},
		&persistencemodel.RawResource{},
		&persistencemodel.UsageReservation{},
		&persistencemodel.UsageLog{},
	)
	cred := persistencemodel.AICredential{
		Model:       gorm.Model{ID: 1},
		AdapterType: ai.AdapterOpenAICompat,
		DisplayName: "OpenAI subtitle align",
		BaseURL:     server.URL + "/v1",
		IsEnabled:   true,
	}
	if err := db.Create(&cred).Error; err != nil {
		t.Fatalf("create credential: %v", err)
	}
	cfg := persistencemodel.AIModelConfig{
		Model:              gorm.Model{ID: 11},
		CredentialID:       cred.ID,
		ModelDefID:         "logical-align",
		ModelIDOverride:    "align-provider-model",
		CustomCapabilities: ai.CapabilitySubAlign,
		IsEnabled:          true,
	}
	if err := db.Create(&cfg).Error; err != nil {
		t.Fatalf("create model config: %v", err)
	}

	store, err := storage.NewFileSystemStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create storage: %v", err)
	}
	if err := store.Put(context.Background(), "audio/input.wav", strings.NewReader("wav-bytes"), 9, "audio/wav"); err != nil {
		t.Fatalf("put audio object: %v", err)
	}
	resource := persistencemodel.RawResource{
		Model:          gorm.Model{ID: 21},
		OwnerID:        42,
		Type:           "audio",
		Name:           "input.wav",
		MimeType:       "audio/wav",
		StorageBackend: "filesystem",
		StorageKey:     "audio/input.wav",
		Size:           9,
	}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatalf("create resource: %v", err)
	}

	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)), store)
	resp, err := service.Align(context.Background(), AlignInput{
		UserID:          42,
		ModelConfigID:   cfg.ID,
		AudioResourceID: resource.ID,
		Script:          "hello world",
		Language:        "en",
	})
	if err != nil {
		t.Fatalf("Align() error = %v", err)
	}
	if gotPath != "/v1/audio/transcriptions" {
		t.Fatalf("path = %q, want /v1/audio/transcriptions", gotPath)
	}
	if gotModel != "align-provider-model" || gotLanguage != "en" {
		t.Fatalf("form model/language = %q/%q, want provider model and language", gotModel, gotLanguage)
	}
	if string(gotAudio) != "wav-bytes" {
		t.Fatalf("audio bytes = %q, want stored audio", string(gotAudio))
	}
	if resp.Text != "hello world" || resp.Timing.Language != "en" {
		t.Fatalf("Align() response = %+v, want transcript and timing language", resp)
	}
}
