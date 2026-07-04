package contract

import (
	"context"
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/movscript/movscript/internal/domain/media"
)

type fakeBlobStorage struct{}

func (fakeBlobStorage) Put(context.Context, string, io.Reader, int64, string) error { return nil }
func (fakeBlobStorage) Delete(context.Context, string) error                        { return nil }
func (fakeBlobStorage) DirectURL(context.Context, string) (string, error)           { return "", nil }
func (fakeBlobStorage) GetObject(context.Context, string, int64, int64) (io.ReadCloser, int64, string, error) {
	return nil, 0, "", nil
}
func (fakeBlobStorage) Backend() string { return AdapterFilesystem }
func (fakeBlobStorage) Health(context.Context) ProviderHealth {
	return ProviderHealth{Type: TypeBlobStorage, Adapter: AdapterFilesystem, Assembly: AssemblyStartup, Status: HealthStatusOK}
}

type fakeCache struct{}

func (fakeCache) GetJSON(context.Context, string, any) (bool, error)        { return false, nil }
func (fakeCache) SetJSON(context.Context, string, any, time.Duration) error { return nil }
func (fakeCache) Delete(context.Context, ...string) error                   { return nil }
func (fakeCache) GetVersion(context.Context, string) (int64, error)         { return 0, nil }
func (fakeCache) BumpVersion(context.Context, string) (int64, error)        { return 0, nil }
func (fakeCache) Close() error                                              { return nil }

type fakeAIGateway struct{}

func (fakeAIGateway) TextGenerate(context.Context, TextRequest) (TextResponse, error) {
	return TextResponse{}, nil
}
func (fakeAIGateway) ImageGenerate(context.Context, ImageRequest) (ImageResponse, error) {
	return ImageResponse{}, nil
}
func (fakeAIGateway) VideoGenerate(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, nil
}
func (fakeAIGateway) Ping(context.Context) error { return nil }
func (fakeAIGateway) TextStream(context.Context, TextRequest) (<-chan TextStreamEvent, error) {
	return nil, nil
}
func (fakeAIGateway) ResponsesGenerate(context.Context, ResponsesRequest) (TextResponse, error) {
	return TextResponse{}, nil
}
func (fakeAIGateway) VideoStart(context.Context, VideoRequest) (VideoResponse, error) {
	return VideoResponse{}, nil
}
func (fakeAIGateway) VideoPoll(context.Context, VideoPollRequest) (VideoResponse, error) {
	return VideoResponse{}, nil
}
func (fakeAIGateway) VideoCancel(context.Context, VideoCancelRequest) (VideoResponse, error) {
	return VideoResponse{}, nil
}
func (fakeAIGateway) Synthesize(context.Context, media.TTSRequest) (media.TTSResponse, error) {
	return media.TTSResponse{}, nil
}
func (fakeAIGateway) GenerateAudio(context.Context, media.AudioGenerationRequest) (media.AudioGenerationResponse, error) {
	return media.AudioGenerationResponse{}, nil
}
func (fakeAIGateway) Transcribe(context.Context, media.TranscribeRequest) (media.SubtitleResponse, error) {
	return media.SubtitleResponse{}, nil
}
func (fakeAIGateway) Align(context.Context, media.AlignRequest) (media.SubtitleResponse, error) {
	return media.SubtitleResponse{}, nil
}
func (fakeAIGateway) CreateEmbeddings(context.Context, EmbeddingRequest) (EmbeddingResponse, error) {
	return EmbeddingResponse{}, nil
}
func (fakeAIGateway) Rerank(context.Context, RerankRequest) (RerankResponse, error) {
	return RerankResponse{}, nil
}
func (fakeAIGateway) Moderate(context.Context, ModerationRequest) (ModerationResponse, error) {
	return ModerationResponse{}, nil
}
func (fakeAIGateway) ConnectRealtime(context.Context, RealtimeSessionRequest) (RealtimeSession, error) {
	return fakeRealtimeSession{}, nil
}

type fakeRealtimeSession struct{}

func (fakeRealtimeSession) SendEvent(context.Context, RealtimeEvent) error { return nil }
func (fakeRealtimeSession) ReceiveEvent(context.Context) (RealtimeEvent, error) {
	return RealtimeEvent{}, nil
}
func (fakeRealtimeSession) Close() error { return nil }

type fakeAIGatewayFileUploader struct{}

func (fakeAIGatewayFileUploader) UploadFile(context.Context, []byte, string, string, string) (string, error) {
	return "", nil
}
func (fakeAIGatewayFileUploader) DeleteFile(context.Context, string) error { return nil }

type fakeVectorIndex struct{}

func (fakeVectorIndex) Upsert(context.Context, VectorDocument) error { return nil }
func (fakeVectorIndex) Delete(context.Context, VectorDocumentRef) error {
	return nil
}
func (fakeVectorIndex) Search(context.Context, VectorSearchRequest) ([]VectorSearchResult, error) {
	return nil, nil
}
func (fakeVectorIndex) Stats(context.Context) (VectorIndexStats, error) {
	return VectorIndexStats{}, nil
}
func (fakeVectorIndex) Rebuild(context.Context, VectorRebuildRequest) (VectorRebuildResult, error) {
	return VectorRebuildResult{}, nil
}

type fakeMediaProcessing struct{}

func (fakeMediaProcessing) Probe(context.Context, MediaProbeRequest) (MediaProbeResult, error) {
	return MediaProbeResult{}, nil
}
func (fakeMediaProcessing) Transcode(context.Context, MediaTranscodeRequest) (MediaTranscodeResult, error) {
	return MediaTranscodeResult{}, nil
}
func (fakeMediaProcessing) ExtractFrame(context.Context, MediaFrameRequest) (MediaFrameResult, error) {
	return MediaFrameResult{}, nil
}

type fakeExternalResource struct{}

func (fakeExternalResource) Search(context.Context, ExternalResourceSearchRequest) (ExternalResourceSearchResult, error) {
	return ExternalResourceSearchResult{}, nil
}

type fakeAgentRuntime struct{}

func (fakeAgentRuntime) EnsureRuntime(context.Context, AgentRuntimeProfile) (AgentRuntimeSession, error) {
	return AgentRuntimeSession{}, nil
}
func (fakeAgentRuntime) StartSession(context.Context, AgentSessionRequest) (AgentSessionRef, error) {
	return AgentSessionRef{}, nil
}
func (fakeAgentRuntime) SendMessage(context.Context, AgentSessionRef, AgentMessage) (<-chan AgentEvent, error) {
	return nil, nil
}
func (fakeAgentRuntime) ListTools(context.Context, AgentSessionRef) ([]AgentToolDescriptor, error) {
	return nil, nil
}
func (fakeAgentRuntime) StopSession(context.Context, AgentSessionRef) error { return nil }

var (
	_ BlobStorage                      = fakeBlobStorage{}
	_ Cache                            = fakeCache{}
	_ AIGatewayProvider                = fakeAIGateway{}
	_ AIGatewayTextStreamProvider      = fakeAIGateway{}
	_ AIGatewayResponsesProvider       = fakeAIGateway{}
	_ AIGatewayVideoTaskProvider       = fakeAIGateway{}
	_ AIGatewayVideoTaskCancelProvider = fakeAIGateway{}
	_ AIGatewayEmbeddingProvider       = fakeAIGateway{}
	_ AIGatewayRerankProvider          = fakeAIGateway{}
	_ AIGatewayModerationProvider      = fakeAIGateway{}
	_ AIGatewayRealtimeProvider        = fakeAIGateway{}
	_ AIGatewayAudioSpeechProvider     = fakeAIGateway{}
	_ AIGatewayAudioGenerationProvider = fakeAIGateway{}
	_ AIGatewayAudioSubtitleProvider   = fakeAIGateway{}
	_ AIGatewayFileUploader            = fakeAIGatewayFileUploader{}
	_ VectorIndexProvider              = fakeVectorIndex{}
	_ MediaProcessingProvider          = fakeMediaProcessing{}
	_ ExternalResourceProvider         = fakeExternalResource{}
	_ AgentRuntimeProvider             = fakeAgentRuntime{}
)

func TestAgentRuntimeWireProtocolConstants(t *testing.T) {
	if AgentRuntimeWireProtocolVersion != "movscript.agent-runtime.v1" {
		t.Fatalf("protocol version = %q", AgentRuntimeWireProtocolVersion)
	}
	for _, endpoint := range []string{
		AgentRuntimeEndpointCreateSession,
		AgentRuntimeEndpointSessionEvents,
		AgentRuntimeEndpointSessionMessages,
		AgentRuntimeEndpointSessionTools,
		AgentRuntimeEndpointStopSession,
		AgentRuntimeEndpointPermissionDecisions,
	} {
		if !strings.HasPrefix(endpoint, "/v1/agent/") {
			t.Fatalf("endpoint = %q, want /v1/agent prefix", endpoint)
		}
	}
	data, err := json.Marshal(AgentRuntimeCapabilities{
		ProtocolVersion: AgentRuntimeWireProtocolVersion,
		Capabilities:    []string{AgentRuntimeCapabilitySessionProxy},
		Endpoints:       AgentRuntimeWireEndpoints{CreateSession: AgentRuntimeEndpointCreateSession},
	})
	if err != nil {
		t.Fatalf("marshal capabilities: %v", err)
	}
	if !strings.Contains(string(data), `"protocol_version":"movscript.agent-runtime.v1"`) {
		t.Fatalf("capabilities json = %s, want protocol_version", data)
	}
}

func TestAIGatewayModelRouteJSONIsProviderFirst(t *testing.T) {
	data, err := json.Marshal(AIGatewayModelRoute{
		ModelID:         "seedance-2-0",
		CatalogEntryID:  12,
		RouteBindingID:  34,
		CredentialID:    56,
		ProviderID:      "volc-ark-main",
		ProviderKind:    "volcengine_ark_official",
		AdapterKey:      "volcengine_ark",
		ProviderModelID: "doubao-seedance-2-0-pro-250528",
		Capability:      "video_generation",
		Operation:       "first_last_frame_to_video",
		APIKind:         "openai_responses",
		APIKinds:        []string{"openai_responses", "openai_chat_completions"},
	})
	if err != nil {
		t.Fatalf("marshal route: %v", err)
	}
	payload := string(data)
	if strings.Contains(payload, "credential_id") {
		t.Fatalf("route json = %s, want no credential_id exposure", payload)
	}
	for _, want := range []string{`"provider_id":"volc-ark-main"`, `"provider_kind":"volcengine_ark_official"`, `"provider_model_id":"doubao-seedance-2-0-pro-250528"`, `"operation":"first_last_frame_to_video"`, `"api_kinds":["openai_responses","openai_chat_completions"]`} {
		if !strings.Contains(payload, want) {
			t.Fatalf("route json = %s, want %s", payload, want)
		}
	}
}

func TestAIModelDescriptorJSONIsProviderFirst(t *testing.T) {
	data, err := json.Marshal(AIModelDescriptor{
		ModelID:         "seedance-2-0",
		CatalogEntryID:  12,
		CredentialID:    56,
		ProviderID:      "volc-ark-main",
		ProviderModelID: "doubao-seedance-2-0-pro-250528",
		DisplayName:     "Seedance 2.0",
		Capabilities:    []string{"video_generation"},
	})
	if err != nil {
		t.Fatalf("marshal descriptor: %v", err)
	}
	payload := string(data)
	if strings.Contains(payload, "credential_id") {
		t.Fatalf("descriptor json = %s, want no credential_id exposure", payload)
	}
	for _, want := range []string{`"provider_id":"volc-ark-main"`, `"provider_model_id":"doubao-seedance-2-0-pro-250528"`} {
		if !strings.Contains(payload, want) {
			t.Fatalf("descriptor json = %s, want %s", payload, want)
		}
	}
}
