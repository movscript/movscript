package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/movscript/movscript/internal/domain/media"
)

func TestNewAPIFakeServerSmokeCoversRuntimeEndpoints(t *testing.T) {
	server := newFakeNewAPISmokeServer(t)
	defer server.Close()

	ctx := context.Background()
	adapter := NewNewAPIAdapter("test-key", server.URL+"/v1")

	models, err := adapter.FetchModels(ctx)
	if err != nil {
		t.Fatalf("FetchModels() error = %v", err)
	}
	if len(models) != 12 || models[0] != "gpt-test" {
		t.Fatalf("models = %#v", models)
	}
	discoverySummary := auditNewAPISmokeModelDiscovery(t, models)
	if discoverySummary[CapabilityFamilyVideoGeneration+"/"+NewAPIProfileJimengAction] == 0 {
		t.Fatalf("discovery summary = %#v, want Seedance-like model bucketed as Jimeng Action", discoverySummary)
	}
	if discoverySummary[CapabilityFamilyVideoGeneration+"/"+NewAPIProfileSoraVideoMultipart] == 0 {
		t.Fatalf("discovery summary = %#v, want Sora-like model bucketed as Sora Video", discoverySummary)
	}

	text, err := adapter.TextGenerate(ctx, TextRequest{
		Model:    "gpt-test",
		Messages: []Message{{Role: "user", Content: "hello"}},
	})
	if err != nil {
		t.Fatalf("TextGenerate() error = %v", err)
	}
	if text.Content != "chat ok" || text.Usage.InputTokens != 2 || text.Usage.OutputTokens != 3 {
		t.Fatalf("text response = %+v", text)
	}

	responses, err := adapter.ResponsesGenerate(ctx, ResponsesRequest{
		Text: TextRequest{
			Model:    "gpt-test",
			Messages: []Message{{Role: "user", Content: "hello"}},
		},
	})
	if err != nil {
		t.Fatalf("ResponsesGenerate() error = %v", err)
	}
	if responses.Content != "responses ok" || responses.Usage.InputTokens != 2 || responses.Usage.OutputTokens != 4 {
		t.Fatalf("responses = %+v", responses)
	}

	embedding, err := adapter.CreateEmbeddings(ctx, EmbeddingRequest{
		Model:          "embed-test",
		Inputs:         []string{"embed me"},
		EncodingFormat: "float",
		Dimensions:     2,
	})
	if err != nil {
		t.Fatalf("CreateEmbeddings() error = %v", err)
	}
	if embedding.Model != "embed-test" || len(embedding.Data) != 1 || len(embedding.Data[0].Embedding) != 2 || embedding.Usage.InputTokens != 3 {
		t.Fatalf("embedding = %+v", embedding)
	}

	rerank, err := adapter.Rerank(ctx, RerankRequest{
		Model: "rerank-test",
		Query: "best doc",
		Documents: []RerankDocument{
			{Text: "doc a"},
			{Data: map[string]any{"text": "doc b", "id": "b"}},
		},
		TopN:            1,
		ReturnDocuments: true,
	})
	if err != nil {
		t.Fatalf("Rerank() error = %v", err)
	}
	if rerank.ID != "rerank_1" || len(rerank.Results) != 1 || rerank.Results[0].Index != 1 || rerank.Results[0].RelevanceScore != 0.92 {
		t.Fatalf("rerank = %+v", rerank)
	}

	moderation, err := adapter.Moderate(ctx, ModerationRequest{
		Model:  "mod-test",
		Inputs: []string{"check this"},
	})
	if err != nil {
		t.Fatalf("Moderate() error = %v", err)
	}
	if moderation.ID != "mod_1" || moderation.Model != "mod-test" || len(moderation.Results) != 1 || moderation.Results[0].Flagged {
		t.Fatalf("moderation = %+v", moderation)
	}

	image, err := adapter.ImageGenerate(ctx, ImageRequest{
		Model:  "image-test",
		Prompt: "draw",
		Size:   "1024x1024",
	})
	if err != nil {
		t.Fatalf("ImageGenerate() error = %v", err)
	}
	if len(image.URLs) != 1 || image.URLs[0] != "https://cdn.example.test/image.png" {
		t.Fatalf("image response = %+v", image)
	}

	imageBase64, err := adapter.ImageGenerate(ctx, ImageRequest{
		Model:  "image-test",
		Prompt: "draw-base64",
		Size:   "1024x1024",
	})
	if err != nil {
		t.Fatalf("ImageGenerate(base64) error = %v", err)
	}
	if len(imageBase64.URLs) != 1 || imageBase64.URLs[0] != "data:image/png;base64,aGVsbG8=" {
		t.Fatalf("image base64 response = %+v", imageBase64)
	}

	imageEdit, err := adapter.ImageGenerate(ctx, ImageRequest{
		Model:           "image-test",
		Prompt:          "edit",
		Size:            "1024x1024",
		InputImageBytes: []byte("png-bytes"),
		InputImageMime:  "image/png",
	})
	if err != nil {
		t.Fatalf("ImageGenerate(edit) error = %v", err)
	}
	if len(imageEdit.URLs) != 1 || imageEdit.URLs[0] != "data:image/png;base64,ZWRpdA==" {
		t.Fatalf("image edit response = %+v", imageEdit)
	}

	geminiImage, err := adapter.ImageGenerate(ctx, ImageRequest{
		Model:           "gemini-image-test",
		ProtocolProfile: NewAPIProfileGeminiImages,
		Operation:       ImageOperationEditImage,
		Prompt:          "native gemini image",
		InputImageBytes: []byte("gemini-input"),
		InputImageMime:  "image/png",
	})
	if err != nil {
		t.Fatalf("ImageGenerate(gemini image) error = %v", err)
	}
	if len(geminiImage.URLs) != 1 || geminiImage.URLs[0] != "data:image/png;base64,Z2VtaW5pLWltYWdl" {
		t.Fatalf("gemini image response = %+v", geminiImage)
	}

	speech, err := adapter.Synthesize(ctx, media.TTSRequest{
		Model:       "tts-test",
		Text:        "hello",
		Voice:       "alloy",
		AudioFormat: "mp3",
	})
	if err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	if string(speech.Audio) != "audio-bytes" || speech.MimeType != "audio/mpeg" {
		t.Fatalf("speech response = %+v audio=%q", speech, string(speech.Audio))
	}

	geminiSpeech, err := adapter.Synthesize(ctx, media.TTSRequest{
		Model:           "gemini-audio-test",
		ProtocolProfile: NewAPIProfileGeminiAudio,
		Text:            "hello from gemini",
		Voice:           "Kore",
	})
	if err != nil {
		t.Fatalf("Synthesize(gemini audio) error = %v", err)
	}
	if string(geminiSpeech.Audio) != "gemini-audio-bytes" || geminiSpeech.MimeType != "audio/wav" {
		t.Fatalf("gemini speech response = %+v audio=%q", geminiSpeech, string(geminiSpeech.Audio))
	}

	transcript, err := adapter.Transcribe(ctx, media.TranscribeRequest{
		Model:    "stt-test",
		Audio:    []byte("wav-bytes"),
		MimeType: "audio/wav",
		Language: "en",
		Params: map[string]any{
			"response_format": "verbose_json",
			"prompt":          "smoke prompt",
			"temperature":     0,
		},
	})
	if err != nil {
		t.Fatalf("Transcribe() error = %v", err)
	}
	if string(transcript.Content) != "transcript ok" || transcript.Timing.Language != "en" {
		t.Fatalf("transcript = %+v content=%q", transcript, string(transcript.Content))
	}

	translation, err := adapter.TranslateSpeech(ctx, media.SpeechTranslateRequest{
		Model:    "stt-test",
		Audio:    []byte("wav-bytes"),
		MimeType: "audio/wav",
		Params: map[string]any{
			"response_format": "verbose_json",
			"prompt":          "translate prompt",
			"temperature":     0,
		},
	})
	if err != nil {
		t.Fatalf("TranslateSpeech() error = %v", err)
	}
	if string(translation.Content) != "translation ok" {
		t.Fatalf("translation = %+v content=%q", translation, string(translation.Content))
	}

	speechToSpeech, err := adapter.GenerateSpeechToSpeech(ctx, media.SpeechToSpeechRequest{
		Model:       "gpt-test",
		Prompt:      "respond with audio",
		Audio:       []byte("input-audio"),
		MimeType:    "audio/wav",
		Voice:       "alloy",
		AudioFormat: "mp3",
	})
	if err != nil {
		t.Fatalf("GenerateSpeechToSpeech() error = %v", err)
	}
	if string(speechToSpeech.Audio) != "speech-to-speech-bytes" || speechToSpeech.Text != "speech-to-speech ok" || speechToSpeech.MimeType != "audio/mpeg" {
		t.Fatalf("speech-to-speech response = %+v audio=%q", speechToSpeech, string(speechToSpeech.Audio))
	}

	videoStart, err := adapter.VideoStart(ctx, VideoRequest{
		Model:           "sora-test",
		ProtocolProfile: NewAPIProfileSoraVideoMultipart,
		Prompt:          "video",
		Duration:        8,
		Size:            "1280x720",
		Image:           "https://cdn.example.test/ref.png",
	})
	if err != nil {
		t.Fatalf("VideoStart() error = %v", err)
	}
	if videoStart.TaskID != "video_1" || videoStart.Status != VideoStatusQueued {
		t.Fatalf("video start = %+v", videoStart)
	}
	videoPoll, err := adapter.VideoPoll(ctx, VideoPollRequest{ProtocolProfile: NewAPIProfileSoraVideoMultipart, TaskID: videoStart.TaskID})
	if err != nil {
		t.Fatalf("VideoPoll() error = %v", err)
	}
	if videoPoll.Status != VideoStatusSucceeded || string(videoPoll.ContentBytes) != "mp4-bytes" {
		t.Fatalf("video poll = %+v content=%q", videoPoll, string(videoPoll.ContentBytes))
	}

	seedanceStart, err := adapter.VideoStart(ctx, VideoRequest{
		Model:           "seedance-test",
		ProtocolProfile: NewAPIProfileJimengAction,
		Operation:       VideoOperationFirstLastFrameToVideo,
		Prompt:          "animate between the first and last frame",
		Duration:        5,
		AspectRatio:     "16:9",
		InputImages: []string{
			"https://cdn.example.test/first.png",
			"https://cdn.example.test/last.png",
		},
	})
	if err != nil {
		t.Fatalf("VideoStart(seedance jimeng) error = %v", err)
	}
	if seedanceStart.TaskID != "jimeng_video_1" || seedanceStart.TaskKind != "new_api_jimeng_action" || seedanceStart.Status != VideoStatusQueued {
		t.Fatalf("seedance jimeng start = %+v", seedanceStart)
	}
	seedancePoll, err := adapter.VideoPoll(ctx, VideoPollRequest{
		Model:           "seedance-test",
		ProtocolProfile: NewAPIProfileJimengAction,
		TaskID:          seedanceStart.TaskID,
		TaskKind:        seedanceStart.TaskKind,
	})
	if err != nil {
		t.Fatalf("VideoPoll(seedance jimeng) error = %v", err)
	}
	if seedancePoll.Status != VideoStatusSucceeded || seedancePoll.URL != "https://cdn.example.test/seedance.mp4" {
		t.Fatalf("seedance jimeng poll = %+v", seedancePoll)
	}

	realtime, err := adapter.ConnectRealtime(ctx, RealtimeSessionRequest{Model: "gpt-realtime-test"})
	if err != nil {
		t.Fatalf("ConnectRealtime() error = %v", err)
	}
	defer realtime.Close()
	if err := realtime.SendEvent(ctx, RealtimeEvent{"type": "response.create"}); err != nil {
		t.Fatalf("SendEvent() error = %v", err)
	}
	event, err := realtime.ReceiveEvent(ctx)
	if err != nil {
		t.Fatalf("ReceiveEvent() error = %v", err)
	}
	if event["type"] != "response.done" {
		t.Fatalf("realtime event = %#v", event)
	}
}

func TestNewAPIRealSmokeFromEnvironment(t *testing.T) {
	if strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_REAL_SMOKE")) != "1" {
		t.Skip("set MOVSCRIPT_NEW_API_REAL_SMOKE=1 with New API credentials and model env vars to run the real smoke")
	}
	baseURL := requiredNewAPISmokeEnv(t, "MOVSCRIPT_NEW_API_BASE_URL")
	apiKey := requiredNewAPISmokeEnv(t, "MOVSCRIPT_NEW_API_API_KEY")

	ctx, cancel := context.WithTimeout(context.Background(), newAPISmokeDurationEnv(t, "MOVSCRIPT_NEW_API_REAL_SMOKE_TIMEOUT", 3*time.Minute))
	defer cancel()
	adapter := NewNewAPIAdapter(apiKey, baseURL)
	checkedOperations := 0

	models, err := adapter.FetchModels(ctx)
	if err != nil {
		t.Fatalf("FetchModels() error = %v", err)
	}
	if len(models) == 0 {
		t.Fatal("FetchModels() returned no models")
	}
	t.Logf("FetchModels() returned %d models", len(models))
	auditNewAPISmokeModelDiscovery(t, models)
	if strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_MODELS_ONLY")) == "1" {
		t.Log("MOVSCRIPT_NEW_API_MODELS_ONLY=1; skipping model invocation smoke after FetchModels()")
		return
	}
	if chatModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_CHAT_MODEL")); chatModel != "" {
		checkedOperations++
		text, err := adapter.TextGenerate(ctx, TextRequest{
			Model:           chatModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_CHAT_PROTOCOL_PROFILE")),
			Messages:        []Message{{Role: "user", Content: "Return the word ok."}},
			MaxTokens:       8,
		})
		if err != nil {
			t.Fatalf("TextGenerate() error = %v", err)
		}
		if strings.TrimSpace(text.Content) == "" {
			t.Fatalf("TextGenerate() returned empty content: %+v", text)
		}
	}
	if responsesModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_RESPONSES_MODEL")); responsesModel != "" {
		checkedOperations++
		responses, err := adapter.ResponsesGenerate(ctx, ResponsesRequest{
			Text: TextRequest{
				Model:           responsesModel,
				ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_RESPONSES_PROTOCOL_PROFILE")),
				Messages:        []Message{{Role: "user", Content: "Return the word ok."}},
				MaxTokens:       8,
			},
		})
		if err != nil {
			t.Fatalf("ResponsesGenerate() error = %v", err)
		}
		if strings.TrimSpace(responses.Content) == "" {
			t.Fatalf("ResponsesGenerate() returned empty content: %+v", responses)
		}
	}
	if embeddingModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_EMBEDDING_MODEL")); embeddingModel != "" {
		checkedOperations++
		embedding, err := adapter.CreateEmbeddings(ctx, EmbeddingRequest{
			Model:           embeddingModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_EMBEDDING_PROTOCOL_PROFILE")),
			Inputs:          []string{"New API smoke embedding."},
		})
		if err != nil {
			t.Fatalf("CreateEmbeddings() error = %v", err)
		}
		if len(embedding.Data) == 0 || len(embedding.Data[0].Embedding) == 0 {
			t.Fatalf("CreateEmbeddings() returned empty vectors: %+v", embedding)
		}
	}
	if rerankModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_RERANK_MODEL")); rerankModel != "" {
		checkedOperations++
		rerank, err := adapter.Rerank(ctx, RerankRequest{
			Model:           rerankModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_RERANK_PROTOCOL_PROFILE")),
			Query:           "Which document says ok?",
			Documents:       []RerankDocument{{Text: "ok"}, {Text: "not this one"}},
			TopN:            1,
		})
		if err != nil {
			t.Fatalf("Rerank() error = %v", err)
		}
		if len(rerank.Results) == 0 {
			t.Fatalf("Rerank() returned no results: %+v", rerank)
		}
	}
	if moderationModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_MODERATION_MODEL")); moderationModel != "" {
		checkedOperations++
		moderation, err := adapter.Moderate(ctx, ModerationRequest{
			Model:           moderationModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_MODERATION_PROTOCOL_PROFILE")),
			Inputs:          []string{"This is a harmless New API smoke test."},
		})
		if err != nil {
			t.Fatalf("Moderate() error = %v", err)
		}
		if len(moderation.Results) == 0 {
			t.Fatalf("Moderate() returned no results: %+v", moderation)
		}
	}
	if imageModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_IMAGE_MODEL")); imageModel != "" {
		checkedOperations++
		image, err := adapter.ImageGenerate(ctx, ImageRequest{
			Model:           imageModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_IMAGE_PROTOCOL_PROFILE")),
			Prompt:          "simple red square on white background",
			Size:            "1024x1024",
		})
		if err != nil {
			t.Fatalf("ImageGenerate() error = %v", err)
		}
		requireNewAPISmokeOutputs(t, "ImageGenerate()", image.URLs)
	}
	if editModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_IMAGE_EDIT_MODEL")); editModel != "" {
		checkedOperations++
		editBytes, editMime := newAPIRealSmokeImageEditInput(t)
		imageEdit, err := adapter.ImageGenerate(ctx, ImageRequest{
			Model:           editModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_IMAGE_EDIT_PROTOCOL_PROFILE")),
			Prompt:          "make a small harmless edit",
			Size:            firstNonEmptyAI(os.Getenv("MOVSCRIPT_NEW_API_IMAGE_EDIT_SIZE"), "1024x1024"),
			InputImageBytes: editBytes,
			InputImageMime:  editMime,
		})
		if err != nil {
			t.Fatalf("ImageGenerate(edit) error = %v", err)
		}
		requireNewAPISmokeOutputs(t, "ImageGenerate(edit)", imageEdit.URLs)
	}
	var generatedSpeech []byte
	if ttsModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_TTS_MODEL")); ttsModel != "" {
		checkedOperations++
		speech, err := adapter.Synthesize(ctx, media.TTSRequest{
			Model:           ttsModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_TTS_PROTOCOL_PROFILE")),
			Text:            "New API smoke test.",
			Voice:           firstNonEmptyAI(os.Getenv("MOVSCRIPT_NEW_API_TTS_VOICE"), "alloy"),
			AudioFormat:     firstNonEmptyAI(os.Getenv("MOVSCRIPT_NEW_API_TTS_FORMAT"), "mp3"),
		})
		if err != nil {
			t.Fatalf("Synthesize() error = %v", err)
		}
		if len(speech.Audio) == 0 {
			t.Fatalf("Synthesize() returned empty audio: %+v", speech)
		}
		generatedSpeech = speech.Audio
	}
	var sttAudio []byte
	var sttAudioMime string
	if sttModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_STT_MODEL")); sttModel != "" {
		checkedOperations++
		sttAudio, sttAudioMime = newAPIRealSmokeSTTAudio(t, generatedSpeech)
		transcript, err := adapter.Transcribe(ctx, media.TranscribeRequest{
			Model:           sttModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_STT_PROTOCOL_PROFILE")),
			Audio:           sttAudio,
			MimeType:        sttAudioMime,
			Language:        "en",
		})
		if err != nil {
			t.Fatalf("Transcribe() error = %v", err)
		}
		if len(transcript.Content) == 0 {
			t.Fatalf("Transcribe() returned empty content: %+v", transcript)
		}
	}
	if translationModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_TRANSLATION_MODEL")); translationModel != "" {
		checkedOperations++
		if len(sttAudio) == 0 {
			sttAudio, sttAudioMime = newAPIRealSmokeSTTAudio(t, generatedSpeech)
		}
		translation, err := adapter.TranslateSpeech(ctx, media.SpeechTranslateRequest{
			Model:           translationModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_TRANSLATION_PROTOCOL_PROFILE")),
			Audio:           sttAudio,
			MimeType:        sttAudioMime,
			Params:          map[string]any{"response_format": "json"},
		})
		if err != nil {
			t.Fatalf("TranslateSpeech() error = %v", err)
		}
		if len(translation.Content) == 0 {
			t.Fatalf("TranslateSpeech() returned empty content: %+v", translation)
		}
	}
	if speechToSpeechModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_SPEECH_TO_SPEECH_MODEL")); speechToSpeechModel != "" {
		checkedOperations++
		if len(sttAudio) == 0 {
			sttAudio, sttAudioMime = newAPIRealSmokeSTTAudio(t, generatedSpeech)
		}
		speechToSpeech, err := adapter.GenerateSpeechToSpeech(ctx, media.SpeechToSpeechRequest{
			Model:           speechToSpeechModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_SPEECH_TO_SPEECH_PROTOCOL_PROFILE")),
			Prompt:          "Return a short audio reply.",
			Audio:           sttAudio,
			MimeType:        sttAudioMime,
			Voice:           firstNonEmptyAI(os.Getenv("MOVSCRIPT_NEW_API_SPEECH_TO_SPEECH_VOICE"), "alloy"),
			AudioFormat:     firstNonEmptyAI(os.Getenv("MOVSCRIPT_NEW_API_SPEECH_TO_SPEECH_FORMAT"), "mp3"),
		})
		if err != nil {
			t.Fatalf("GenerateSpeechToSpeech() error = %v", err)
		}
		if len(speechToSpeech.Audio) == 0 && strings.TrimSpace(speechToSpeech.Text) == "" {
			t.Fatalf("GenerateSpeechToSpeech() returned no audio or text: %+v", speechToSpeech)
		}
	}
	if realtimeModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_REALTIME_MODEL")); realtimeModel != "" {
		checkedOperations++
		realtime, err := adapter.ConnectRealtime(ctx, RealtimeSessionRequest{
			Model:           realtimeModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_REALTIME_PROTOCOL_PROFILE")),
		})
		if err != nil {
			t.Fatalf("ConnectRealtime() error = %v", err)
		}
		_ = realtime.Close()
		t.Logf("ConnectRealtime() opened and closed model %q", realtimeModel)
	}
	if videoModel := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_VIDEO_MODEL")); videoModel != "" {
		checkedOperations++
		videoStart, err := adapter.VideoStart(ctx, VideoRequest{
			Model:           videoModel,
			ProtocolProfile: strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_VIDEO_PROTOCOL_PROFILE")),
			Prompt:          "A minimal smoke-test frame with the word ok.",
			Duration:        4,
			Size:            firstNonEmptyAI(os.Getenv("MOVSCRIPT_NEW_API_VIDEO_SIZE"), "1280x720"),
		})
		if err != nil {
			t.Fatalf("VideoStart() error = %v", err)
		}
		if videoStart.TaskID == "" {
			t.Fatalf("VideoStart() did not return task id: %+v", videoStart)
		}
		t.Logf("VideoStart() task id %q", videoStart.TaskID)
		pollRealNewAPISmokeVideo(ctx, t, adapter, videoModel, videoStart.TaskID, strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_VIDEO_PROTOCOL_PROFILE")))
	}
	if checkedOperations == 0 {
		t.Fatal("set at least one MOVSCRIPT_NEW_API_*_MODEL env var to run a real New API model smoke")
	}
}

func TestNewAPISmokeDurationEnvAcceptsDurationAndSeconds(t *testing.T) {
	t.Setenv("MOVSCRIPT_TEST_DURATION", "90s")
	if got := newAPISmokeDurationEnv(t, "MOVSCRIPT_TEST_DURATION", time.Second); got != 90*time.Second {
		t.Fatalf("duration = %s, want 90s", got)
	}
	t.Setenv("MOVSCRIPT_TEST_DURATION", "120")
	if got := newAPISmokeDurationEnv(t, "MOVSCRIPT_TEST_DURATION", time.Second); got != 120*time.Second {
		t.Fatalf("duration = %s, want 120s", got)
	}
	t.Setenv("MOVSCRIPT_TEST_DURATION", "")
	if got := newAPISmokeDurationEnv(t, "MOVSCRIPT_TEST_DURATION", 3*time.Second); got != 3*time.Second {
		t.Fatalf("duration = %s, want fallback", got)
	}
}

func TestNewAPIRealSmokeSTTAudioFallsBackToGeneratedSpeech(t *testing.T) {
	t.Setenv("MOVSCRIPT_NEW_API_STT_AUDIO_PATH", "")
	t.Setenv("MOVSCRIPT_NEW_API_STT_AUDIO_MIME", "")

	audio, mimeType := newAPIRealSmokeSTTAudio(t, []byte("generated-mp3"))

	if string(audio) != "generated-mp3" || mimeType != "audio/mpeg" {
		t.Fatalf("audio = %q mime = %q, want generated mp3 fallback", string(audio), mimeType)
	}
}

func TestNewAPIRealSmokeSTTAudioUsesConfiguredFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sample.wav")
	if err := os.WriteFile(path, []byte("wav-data"), 0o600); err != nil {
		t.Fatalf("write sample audio: %v", err)
	}
	t.Setenv("MOVSCRIPT_NEW_API_STT_AUDIO_PATH", path)
	t.Setenv("MOVSCRIPT_NEW_API_STT_AUDIO_MIME", "audio/wav")

	audio, mimeType := newAPIRealSmokeSTTAudio(t, []byte("generated-mp3"))

	if string(audio) != "wav-data" || mimeType != "audio/wav" {
		t.Fatalf("audio = %q mime = %q, want configured wav file", string(audio), mimeType)
	}
}

func TestNewAPIRealSmokeImageEditInputFallsBackToGeneratedPNG(t *testing.T) {
	t.Setenv("MOVSCRIPT_NEW_API_IMAGE_EDIT_INPUT_PATH", "")

	imageBytes, mimeType := newAPIRealSmokeImageEditInput(t)

	if len(imageBytes) == 0 || mimeType != "image/png" {
		t.Fatalf("image edit fallback = %d bytes mime %q, want generated png", len(imageBytes), mimeType)
	}
	if _, err := png.Decode(bytes.NewReader(imageBytes)); err != nil {
		t.Fatalf("decode generated png: %v", err)
	}
}

func TestNewAPIRealSmokeImageEditInputUsesConfiguredFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "input.png")
	if err := os.WriteFile(path, []byte("png-file"), 0o600); err != nil {
		t.Fatalf("write image input: %v", err)
	}
	t.Setenv("MOVSCRIPT_NEW_API_IMAGE_EDIT_INPUT_PATH", path)
	t.Setenv("MOVSCRIPT_NEW_API_IMAGE_EDIT_MIME", "image/custom")

	imageBytes, mimeType := newAPIRealSmokeImageEditInput(t)

	if string(imageBytes) != "png-file" || mimeType != "image/custom" {
		t.Fatalf("image edit input = %q mime = %q, want configured file", string(imageBytes), mimeType)
	}
}

func newFakeNewAPISmokeServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	upgrader := websocket.Upgrader{}
	mux.HandleFunc("/v1/models", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodGet)
		writeNewAPISmokeJSON(t, w, map[string]any{
			"object": "list",
			"data": []map[string]string{
				{"id": "gpt-test"},
				{"id": "image-test"},
				{"id": "tts-test"},
				{"id": "stt-test"},
				{"id": "sora-test"},
				{"id": "seedance-test"},
				{"id": "gemini-image-test"},
				{"id": "gemini-audio-test"},
				{"id": "embed-test"},
				{"id": "rerank-test"},
				{"id": "mod-test"},
				{"id": "gpt-realtime-test"},
			},
		})
	})
	mux.HandleFunc("/v1/chat/completions", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		body := decodeNewAPISmokeJSON(t, r)
		if body["model"] != "gpt-test" {
			t.Fatalf("chat model = %#v", body["model"])
		}
		if newAPISmokeHasString(body["modalities"], "audio") {
			audio, _ := body["audio"].(map[string]any)
			if audio["voice"] != "alloy" || audio["format"] != "mp3" {
				t.Fatalf("speech-to-speech audio config = %#v", audio)
			}
			writeNewAPISmokeJSON(t, w, map[string]any{
				"id": "chatcmpl-audio-1",
				"choices": []map[string]any{{
					"message": map[string]any{
						"role": "assistant",
						"audio": map[string]any{
							"id":         "audio_1",
							"data":       base64.StdEncoding.EncodeToString([]byte("speech-to-speech-bytes")),
							"transcript": "speech-to-speech ok",
						},
					},
					"finish_reason": "stop",
				}},
			})
			return
		}
		writeNewAPISmokeJSON(t, w, map[string]any{
			"id": "chatcmpl-1",
			"choices": []map[string]any{{
				"message":       map[string]any{"role": "assistant", "content": "chat ok"},
				"finish_reason": "stop",
			}},
			"usage": map[string]any{"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5},
		})
	})
	mux.HandleFunc("/v1/embeddings", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		body := decodeNewAPISmokeJSON(t, r)
		if body["model"] != "embed-test" || body["input"] != "embed me" || body["encoding_format"] != "float" || body["dimensions"] != float64(2) {
			t.Fatalf("embedding body = %#v", body)
		}
		writeNewAPISmokeJSON(t, w, map[string]any{
			"object": "list",
			"model":  "embed-test",
			"data": []map[string]any{{
				"object":    "embedding",
				"index":     0,
				"embedding": []float64{0.25, 0.5},
			}},
			"usage": map[string]any{"prompt_tokens": 3, "total_tokens": 3},
		})
	})
	mux.HandleFunc("/v1/rerank", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		body := decodeNewAPISmokeJSON(t, r)
		documents, ok := body["documents"].([]any)
		if body["model"] != "rerank-test" || body["query"] != "best doc" || body["top_n"] != float64(1) || body["return_documents"] != true || !ok || len(documents) != 2 || documents[0] != "doc a" {
			t.Fatalf("rerank body = %#v", body)
		}
		writeNewAPISmokeJSON(t, w, map[string]any{
			"id": "rerank_1",
			"results": []map[string]any{{
				"index":           1,
				"relevance_score": 0.92,
				"document":        map[string]any{"text": "doc b", "id": "b"},
			}},
			"meta": map[string]any{"billed_units": 1},
		})
	})
	mux.HandleFunc("/v1/moderations", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		body := decodeNewAPISmokeJSON(t, r)
		if body["model"] != "mod-test" || body["input"] != "check this" {
			t.Fatalf("moderation body = %#v", body)
		}
		writeNewAPISmokeJSON(t, w, map[string]any{
			"id":    "mod_1",
			"model": "mod-test",
			"results": []map[string]any{{
				"flagged":         false,
				"categories":      map[string]bool{"violence": false},
				"category_scores": map[string]float64{"violence": 0.01},
			}},
		})
	})
	mux.HandleFunc("/v1/responses", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		body := decodeNewAPISmokeJSON(t, r)
		if body["model"] != "gpt-test" {
			t.Fatalf("responses model = %#v", body["model"])
		}
		writeNewAPISmokeJSON(t, w, map[string]any{
			"id":          "resp-1",
			"status":      "completed",
			"output_text": "responses ok",
			"usage":       map[string]any{"input_tokens": 2, "output_tokens": 4, "total_tokens": 6},
		})
	})
	mux.HandleFunc("/v1/images/generations", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		body := decodeNewAPISmokeJSON(t, r)
		if body["model"] != "image-test" {
			t.Fatalf("image model = %#v", body["model"])
		}
		if body["prompt"] == "draw-base64" {
			writeNewAPISmokeJSON(t, w, map[string]any{
				"created":       time.Now().Unix(),
				"data":          []map[string]string{{"b64_json": "aGVsbG8="}},
				"output_format": "png",
			})
			return
		}
		writeNewAPISmokeJSON(t, w, map[string]any{
			"created": time.Now().Unix(),
			"data":    []map[string]string{{"url": "https://cdn.example.test/image.png"}},
		})
	})
	mux.HandleFunc("/v1/images/edits", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		form := parseNewAPISmokeMultipart(t, r)
		if got := form.Value["model"]; len(got) != 1 || got[0] != "image-test" {
			t.Fatalf("image edit model = %#v", got)
		}
		if got := form.Value["prompt"]; len(got) != 1 || got[0] != "edit" {
			t.Fatalf("image edit prompt = %#v", got)
		}
		if got := form.Value["size"]; len(got) != 1 || got[0] != "1024x1024" {
			t.Fatalf("image edit size = %#v", got)
		}
		if len(form.File["image"]) != 1 {
			t.Fatalf("image edit files = %#v", form.File["image"])
		}
		writeNewAPISmokeJSON(t, w, map[string]any{
			"created":       time.Now().Unix(),
			"data":          []map[string]string{{"b64_json": "ZWRpdA=="}},
			"output_format": "png",
		})
	})
	mux.HandleFunc("/v1beta/models/gemini-image-test:generateContent", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		body := decodeNewAPISmokeJSON(t, r)
		contents := body["contents"].([]any)
		parts := contents[0].(map[string]any)["parts"].([]any)
		imagePart := parts[0].(map[string]any)["inlineData"].(map[string]any)
		textPart := parts[1].(map[string]any)
		if imagePart["mimeType"] != "image/png" || imagePart["data"] != "Z2VtaW5pLWlucHV0" || textPart["text"] != "native gemini image" {
			t.Fatalf("gemini image parts = %#v", parts)
		}
		generationConfig := body["generationConfig"].(map[string]any)
		modalities := generationConfig["responseModalities"].([]any)
		if len(modalities) != 2 || modalities[0] != "IMAGE" || modalities[1] != "TEXT" {
			t.Fatalf("gemini image generationConfig = %#v", generationConfig)
		}
		writeNewAPISmokeJSON(t, w, map[string]any{
			"candidates": []map[string]any{{
				"content": map[string]any{
					"role": "model",
					"parts": []map[string]any{{
						"inlineData": map[string]any{
							"mimeType": "image/png",
							"data":     "Z2VtaW5pLWltYWdl",
						},
					}},
				},
			}},
		})
	})
	mux.HandleFunc("/v1beta/models/gemini-audio-test:generateContent", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		body := decodeNewAPISmokeJSON(t, r)
		contents := body["contents"].([]any)
		parts := contents[0].(map[string]any)["parts"].([]any)
		if parts[0].(map[string]any)["text"] != "hello from gemini" {
			t.Fatalf("gemini audio parts = %#v", parts)
		}
		generationConfig := body["generationConfig"].(map[string]any)
		modalities := generationConfig["responseModalities"].([]any)
		speechConfig := generationConfig["speechConfig"].(map[string]any)
		voiceConfig := speechConfig["voiceConfig"].(map[string]any)
		prebuilt := voiceConfig["prebuiltVoiceConfig"].(map[string]any)
		if len(modalities) != 1 || modalities[0] != "AUDIO" || prebuilt["voiceName"] != "Kore" {
			t.Fatalf("gemini audio generationConfig = %#v", generationConfig)
		}
		writeNewAPISmokeJSON(t, w, map[string]any{
			"candidates": []map[string]any{{
				"content": map[string]any{
					"role": "model",
					"parts": []map[string]any{{
						"inlineData": map[string]any{
							"mimeType": "audio/wav",
							"data":     base64.StdEncoding.EncodeToString([]byte("gemini-audio-bytes")),
						},
					}},
				},
			}},
		})
	})
	mux.HandleFunc("/v1/audio/speech", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		body := decodeNewAPISmokeJSON(t, r)
		if body["model"] != "tts-test" || body["voice"] != "alloy" {
			t.Fatalf("speech body = %#v", body)
		}
		if body["response_format"] != "mp3" {
			t.Fatalf("speech response_format = %#v", body["response_format"])
		}
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("audio-bytes"))
	})
	mux.HandleFunc("/v1/audio/transcriptions", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		form := parseNewAPISmokeMultipart(t, r)
		if got := form.Value["model"]; len(got) != 1 || got[0] != "stt-test" {
			t.Fatalf("transcription model = %#v", got)
		}
		if got := form.Value["language"]; len(got) != 1 || got[0] != "en" {
			t.Fatalf("transcription language = %#v", got)
		}
		if got := form.Value["response_format"]; len(got) != 1 || got[0] != "verbose_json" {
			t.Fatalf("transcription response_format = %#v", got)
		}
		if got := form.Value["prompt"]; len(got) != 1 || got[0] != "smoke prompt" {
			t.Fatalf("transcription prompt = %#v", got)
		}
		if got := form.Value["temperature"]; len(got) != 1 || got[0] != "0" {
			t.Fatalf("transcription temperature = %#v", got)
		}
		if len(form.File["file"]) != 1 {
			t.Fatalf("transcription files = %#v", form.File["file"])
		}
		writeNewAPISmokeJSON(t, w, map[string]any{
			"text":     "transcript ok",
			"language": "en",
			"segments": []map[string]any{{
				"text":  "transcript ok",
				"start": 0,
				"end":   1,
			}},
		})
	})
	mux.HandleFunc("/v1/audio/translations", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		form := parseNewAPISmokeMultipart(t, r)
		if got := form.Value["model"]; len(got) != 1 || got[0] != "stt-test" {
			t.Fatalf("translation model = %#v", got)
		}
		if got := form.Value["response_format"]; len(got) != 1 || got[0] != "verbose_json" {
			t.Fatalf("translation response_format = %#v", got)
		}
		if got := form.Value["prompt"]; len(got) != 1 || got[0] != "translate prompt" {
			t.Fatalf("translation prompt = %#v", got)
		}
		if got := form.Value["temperature"]; len(got) != 1 || got[0] != "0" {
			t.Fatalf("translation temperature = %#v", got)
		}
		if len(form.File["file"]) != 1 {
			t.Fatalf("translation files = %#v", form.File["file"])
		}
		writeNewAPISmokeJSON(t, w, map[string]any{
			"text": "translation ok",
			"segments": []map[string]any{{
				"text":  "translation ok",
				"start": 0,
				"end":   1,
			}},
		})
	})
	mux.HandleFunc("/v1/videos", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		form := parseNewAPISmokeMultipart(t, r)
		for _, key := range []string{"model", "prompt", "duration", "width", "height", "image"} {
			if len(form.Value[key]) == 0 || strings.TrimSpace(form.Value[key][0]) == "" {
				t.Fatalf("video missing field %q: %#v", key, form.Value)
			}
		}
		if _, ok := form.Value["seconds"]; ok {
			t.Fatalf("new_api video request must not include seconds: %#v", form.Value)
		}
		if _, ok := form.Value["input_reference[]"]; ok {
			t.Fatalf("new_api video request must not include input_reference[]: %#v", form.Value)
		}
		writeNewAPISmokeJSON(t, w, map[string]any{"id": "video_1", "status": "queued", "seconds": "8"})
	})
	mux.HandleFunc("/v1/videos/video_1", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodGet)
		writeNewAPISmokeJSON(t, w, map[string]any{"id": "video_1", "status": "completed", "seconds": 8})
	})
	mux.HandleFunc("/v1/videos/video_1/content", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodGet)
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write([]byte("mp4-bytes"))
	})
	mux.HandleFunc("/v1/video/generations/jimeng_video_1", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodGet)
		writeNewAPISmokeJSON(t, w, map[string]any{
			"code": "success",
			"data": map[string]any{
				"task_id": "jimeng_video_1",
				"status":  "succeeded",
				"metadata": map[string]any{
					"url":     "https://cdn.example.test/seedance.mp4",
					"seconds": 5,
				},
			},
		})
	})
	mux.HandleFunc("/jimeng/", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodPost)
		body := decodeNewAPISmokeJSON(t, r)
		switch r.URL.Query().Get("Action") {
		case "CVSync2AsyncSubmitTask":
			if r.URL.Query().Get("Version") != "2022-08-31" {
				t.Fatalf("jimeng submit version = %q", r.URL.Query().Get("Version"))
			}
			if body["req_key"] != "seedance-test" || body["model"] != "seedance-test" || body["prompt"] != "animate between the first and last frame" ||
				body["frames"] != float64(121) || body["aspect_ratio"] != "16:9" {
				t.Fatalf("jimeng submit body = %#v", body)
			}
			imageURLs, ok := body["image_urls"].([]any)
			if !ok || len(imageURLs) != 2 ||
				imageURLs[0] != "https://cdn.example.test/first.png" ||
				imageURLs[1] != "https://cdn.example.test/last.png" {
				t.Fatalf("jimeng image_urls = %#v", body["image_urls"])
			}
			if _, ok := body["binary_data_base64"]; ok {
				t.Fatalf("jimeng URL-image request must not include binary_data_base64: %#v", body)
			}
			writeNewAPISmokeJSON(t, w, map[string]any{
				"code":   10000,
				"status": "in_queue",
				"data":   map[string]any{"task_id": "jimeng_video_1", "seconds": 5},
			})
		case "CVSync2AsyncGetResult":
			if body["task_id"] != "jimeng_video_1" || body["req_key"] != "seedance-test" {
				t.Fatalf("jimeng poll body = %#v", body)
			}
			writeNewAPISmokeJSON(t, w, map[string]any{
				"code":   10000,
				"status": "succeeded",
				"data": map[string]any{
					"task_id":   "jimeng_video_1",
					"video_url": "https://cdn.example.test/seedance.mp4",
					"seconds":   5,
				},
			})
		default:
			t.Fatalf("jimeng action = %q", r.URL.Query().Get("Action"))
		}
	})
	mux.HandleFunc("/v1/realtime", func(w http.ResponseWriter, r *http.Request) {
		requireNewAPISmokeRequest(t, r, http.MethodGet)
		if r.URL.Query().Get("model") != "gpt-realtime-test" {
			t.Fatalf("realtime model = %q", r.URL.Query().Get("model"))
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("upgrade realtime: %v", err)
		}
		defer conn.Close()
		var event map[string]any
		if err := conn.ReadJSON(&event); err != nil {
			t.Fatalf("read realtime event: %v", err)
		}
		if event["type"] != "response.create" {
			t.Fatalf("realtime request event = %#v", event)
		}
		if err := conn.WriteJSON(map[string]any{"type": "response.done"}); err != nil {
			t.Fatalf("write realtime event: %v", err)
		}
	})
	return httptest.NewServer(mux)
}

func requireNewAPISmokeRequest(t *testing.T, r *http.Request, method string) {
	t.Helper()
	if r.Method != method {
		t.Fatalf("%s method = %s, want %s", r.URL.Path, r.Method, method)
	}
	if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
		t.Fatalf("%s Authorization = %q", r.URL.Path, got)
	}
}

func decodeNewAPISmokeJSON(t *testing.T, r *http.Request) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		t.Fatalf("decode %s body: %v", r.URL.Path, err)
	}
	return body
}

func writeNewAPISmokeJSON(t *testing.T, w http.ResponseWriter, body any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(body); err != nil {
		t.Fatalf("encode response: %v", err)
	}
}

func parseNewAPISmokeMultipart(t *testing.T, r *http.Request) *multipart.Form {
	t.Helper()
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		raw, _ := io.ReadAll(r.Body)
		t.Fatalf("parse multipart %s: %v body=%q", r.URL.Path, err, string(raw))
	}
	return r.MultipartForm
}

func auditNewAPISmokeModelDiscovery(t *testing.T, models []string) map[string]int {
	t.Helper()
	summary := map[string]int{}
	for _, model := range models {
		model = strings.TrimSpace(model)
		if model == "" {
			continue
		}
		capabilities := inferNewAPISmokeDiscoveryCapabilities(model)
		profile := InferNewAPIProtocolProfile(model, capabilities)
		def, ok := NewAPIProtocolProfile(profile)
		if !ok || !def.Implemented {
			t.Fatalf("model %q inferred unsupported new_api profile %q for capabilities %#v", model, profile, capabilities)
		}
		capability := firstNonEmptyAI(def.CapabilityFamily, firstNonEmptyAI(capabilities...))
		summary[capability+"/"+profile]++
		normalized := normalizeNewAPIModelID(model)
		switch {
		case strings.Contains(normalized, "seedance") || strings.Contains(normalized, "jimeng"):
			if profile != NewAPIProfileJimengAction {
				t.Fatalf("model %q inferred profile %q, want %q", model, profile, NewAPIProfileJimengAction)
			}
		case strings.Contains(normalized, "kling"):
			if profile != NewAPIProfileKlingVideo {
				t.Fatalf("model %q inferred profile %q, want %q", model, profile, NewAPIProfileKlingVideo)
			}
		case strings.Contains(normalized, "sora"):
			if profile != NewAPIProfileSoraVideoMultipart {
				t.Fatalf("model %q inferred profile %q, want %q", model, profile, NewAPIProfileSoraVideoMultipart)
			}
		}
	}
	t.Logf("New API discovery profile summary: %s", formatNewAPISmokeDiscoverySummary(summary))
	return summary
}

func inferNewAPISmokeDiscoveryCapabilities(modelID string) []string {
	id := normalizeNewAPIModelID(modelID)
	switch {
	case id == "":
		return []string{CapabilityFamilyTextGeneration}
	case strings.Contains(id, "rerank"):
		return []string{CapabilityFamilyRerank}
	case strings.Contains(id, "moderation") || strings.Contains(id, "moderations") || strings.HasPrefix(id, "mod-") || strings.Contains(id, "-mod-"):
		return []string{CapabilityFamilyModeration}
	case strings.Contains(id, "realtime"):
		return []string{CapabilityFamilyRealtime}
	case strings.Contains(id, "embedding") || strings.Contains(id, "embed"):
		return []string{CapabilityFamilyEmbedding}
	case strings.Contains(id, "seedance") || strings.Contains(id, "jimeng") || strings.Contains(id, "ji-meng") ||
		strings.Contains(id, "kling") || strings.Contains(id, "sora") || strings.HasPrefix(id, "veo-") ||
		strings.Contains(id, "-video") || strings.Contains(id, "hailuo"):
		return []string{CapabilityFamilyVideoGeneration}
	case strings.Contains(id, "gpt-image") || strings.Contains(id, "chatgpt-image") ||
		strings.Contains(id, "qwen-image") || strings.Contains(id, "imagen") || strings.Contains(id, "seedream") ||
		strings.Contains(id, "-image") || strings.HasPrefix(id, "image-"):
		return []string{CapabilityFamilyImageGeneration}
	case strings.Contains(id, "tts") || strings.Contains(id, "text-to-speech") ||
		strings.Contains(id, "transcribe") || strings.Contains(id, "whisper") || strings.Contains(id, "-asr") ||
		strings.HasSuffix(id, "asr") || strings.Contains(id, "stt") || strings.Contains(id, "speech-to-text") ||
		strings.Contains(id, "audio-preview") || strings.Contains(id, "music") || strings.Contains(id, "suno"):
		return []string{CapabilityFamilyAudioGeneration}
	default:
		if strings.Contains(id, "reasoner") || strings.Contains(id, "thinking") ||
			strings.Contains(id, "deepseek-r1") || strings.Contains(id, "qwq") || strings.Contains(id, "qvq") ||
			strings.HasPrefix(id, "o1") || strings.HasPrefix(id, "o3") || strings.HasPrefix(id, "o4") ||
			strings.HasPrefix(id, "gpt-5") || strings.Contains(id, "qwen3") {
			return []string{CapabilityFamilyTextGeneration, CapabilityReasoning}
		}
		return []string{CapabilityFamilyTextGeneration}
	}
}

func formatNewAPISmokeDiscoverySummary(summary map[string]int) string {
	if len(summary) == 0 {
		return "empty"
	}
	keys := make([]string, 0, len(summary))
	for key := range summary {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var b strings.Builder
	for i, key := range keys {
		if i > 0 {
			b.WriteString("; ")
		}
		b.WriteString(key)
		b.WriteString("=")
		b.WriteString(strconv.Itoa(summary[key]))
	}
	return b.String()
}

func newAPISmokeHasString(raw any, want string) bool {
	values, ok := raw.([]any)
	if !ok {
		return false
	}
	for _, value := range values {
		if s, ok := value.(string); ok && s == want {
			return true
		}
	}
	return false
}

func requireNewAPISmokeOutputs(t *testing.T, name string, outputs []string) {
	t.Helper()
	for _, output := range outputs {
		if strings.TrimSpace(output) != "" {
			return
		}
	}
	t.Fatalf("%s returned no non-empty outputs: %#v", name, outputs)
}

func requiredNewAPISmokeEnv(t *testing.T, key string) string {
	t.Helper()
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		t.Fatalf("%s is required when MOVSCRIPT_NEW_API_REAL_SMOKE=1", key)
	}
	return value
}

func newAPIRealSmokeImageEditInput(t *testing.T) ([]byte, string) {
	t.Helper()
	if path := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_IMAGE_EDIT_INPUT_PATH")); path != "" {
		imageBytes, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read MOVSCRIPT_NEW_API_IMAGE_EDIT_INPUT_PATH: %v", err)
		}
		return imageBytes, firstNonEmptyAI(os.Getenv("MOVSCRIPT_NEW_API_IMAGE_EDIT_MIME"), "image/png")
	}
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode generated image edit input: %v", err)
	}
	t.Log("MOVSCRIPT_NEW_API_IMAGE_EDIT_INPUT_PATH not set; using generated 1x1 PNG for image edit smoke")
	return buf.Bytes(), "image/png"
}

func newAPIRealSmokeSTTAudio(t *testing.T, generatedSpeech []byte) ([]byte, string) {
	t.Helper()
	mimeType := firstNonEmptyAI(os.Getenv("MOVSCRIPT_NEW_API_STT_AUDIO_MIME"), "audio/mpeg")
	if path := strings.TrimSpace(os.Getenv("MOVSCRIPT_NEW_API_STT_AUDIO_PATH")); path != "" {
		audio, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read MOVSCRIPT_NEW_API_STT_AUDIO_PATH: %v", err)
		}
		return audio, firstNonEmptyAI(os.Getenv("MOVSCRIPT_NEW_API_STT_AUDIO_MIME"), "audio/wav")
	}
	if len(generatedSpeech) == 0 {
		t.Fatalf("MOVSCRIPT_NEW_API_STT_AUDIO_PATH is empty and TTS did not return audio to reuse for STT")
	}
	t.Log("MOVSCRIPT_NEW_API_STT_AUDIO_PATH not set; reusing generated TTS audio for STT smoke")
	return generatedSpeech, mimeType
}

func newAPISmokeDurationEnv(t *testing.T, key string, fallback time.Duration) time.Duration {
	t.Helper()
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	if parsed, err := time.ParseDuration(value); err == nil {
		return parsed
	}
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		t.Fatalf("%s must be a positive duration like 10m or a positive number of seconds, got %q", key, value)
	}
	return time.Duration(seconds) * time.Second
}

func pollRealNewAPISmokeVideo(ctx context.Context, t *testing.T, adapter *NewAPIAdapter, model string, taskID string, protocolProfile string) {
	t.Helper()
	interval := newAPISmokeDurationEnv(t, "MOVSCRIPT_NEW_API_VIDEO_POLL_INTERVAL", 5*time.Second)
	timeout := newAPISmokeDurationEnv(t, "MOVSCRIPT_NEW_API_VIDEO_POLL_TIMEOUT", 2*time.Minute)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	deadline := time.After(timeout)
	for {
		select {
		case <-ctx.Done():
			t.Fatalf("video smoke context done: %v", ctx.Err())
		case <-deadline:
			t.Fatalf("video smoke timed out waiting for task %s", taskID)
		case <-ticker.C:
			resp, err := adapter.VideoPoll(ctx, VideoPollRequest{Model: model, TaskID: taskID, ProtocolProfile: protocolProfile})
			if err != nil {
				t.Fatalf("VideoPoll() error = %v", err)
			}
			t.Logf("VideoPoll() task %s status=%q has_url=%t bytes=%d", taskID, resp.Status, resp.URL != "", len(resp.ContentBytes))
			switch resp.Status {
			case VideoStatusSucceeded:
				if resp.URL == "" && len(resp.ContentBytes) == 0 {
					t.Fatalf("video task %s succeeded without URL or content: %+v", taskID, resp)
				}
				return
			case VideoStatusFailed, VideoStatusCancelled:
				t.Fatalf("video task %s ended with status %q: %+v", taskID, resp.Status, resp)
			}
		}
	}
}
