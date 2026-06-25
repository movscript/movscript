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
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
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
	entry := persistencemodel.AIModelCatalogEntry{
		Model:         gorm.Model{ID: 11},
		PublicModelID: "logical-align",
		DisplayName:   "Subtitle Align",
		Capabilities:  ai.CapabilitySubAlign,
		IsEnabled:     true,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceLocalProvider,
		CredentialID:    &cred.ID,
		ProviderModelID: "align-provider-model",
		IsEnabled:       true,
		CapacityWeight:  1,
	}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
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
		ModelID:         entry.PublicModelID,
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

func TestResolveAudioRouteUsesCatalogEntryIDWithoutLegacyModelConfig(t *testing.T) {
	db := testutil.OpenSQLite(t, "app-audio-catalog-route.db",
		&persistencemodel.AIModelCatalogEntry{},
		&persistencemodel.AIModelRouteBinding{},
	)
	entry := persistencemodel.AIModelCatalogEntry{
		PublicModelID: "voice-fast",
		DisplayName:   "Voice Fast",
		IsEnabled:     true,
		Capabilities:  ai.CapabilityAudioTTS,
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatalf("create catalog entry: %v", err)
	}
	if err := db.Create(&persistencemodel.AIModelRouteBinding{
		CatalogEntryID:  entry.ID,
		SourceType:      persistencemodel.ModelRouteSourceRelayGateway,
		RouteGroup:      "priority",
		ProviderModelID: "provider-voice-v1",
		IsEnabled:       true,
		CapacityWeight:  1,
	}).Error; err != nil {
		t.Fatalf("create route binding: %v", err)
	}
	if db.Migrator().HasTable("ai_model_configs") || db.Migrator().HasTable(&persistencemodel.AICredential{}) {
		t.Fatal("catalog audio route test should not create legacy provider tables")
	}

	service := NewService(db, ai.NewAIService(db, ai.NewRegistry(db, nil)), nil)
	ctx := ai.WithProviderRouteGroup(context.Background(), "priority")
	route, err := service.resolveAudioRoute(ctx, 42, "voice-fast", ai.CapabilityAudioTTS)
	if err != nil {
		t.Fatalf("resolveAudioRoute() error = %v", err)
	}
	if route.CatalogEntryID != entry.ID || route.ProviderModelID != "provider-voice-v1" || route.ModelID != "voice-fast" {
		t.Fatalf("route = %#v, want catalog entry route", route)
	}
}
