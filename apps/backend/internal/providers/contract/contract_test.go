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
