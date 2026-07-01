package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"html"
	"math"
	"strings"

	"github.com/movscript/movscript/internal/domain/media"
)

type LocalAdapter struct{}

func NewLocalAdapter() *LocalAdapter {
	return &LocalAdapter{}
}

func (a *LocalAdapter) TextGenerate(_ context.Context, req TextRequest) (TextResponse, error) {
	content := localTextResponse(req)
	return TextResponse{
		Content:      content,
		FinishReason: "stop",
		Usage: TokenUsage{
			InputTokens:  estimateTextInputTokens(req),
			OutputTokens: maxPositive(len(strings.Fields(content)), 1),
		},
	}, nil
}

func (a *LocalAdapter) TextStream(ctx context.Context, req TextRequest) (<-chan TextStreamEvent, error) {
	resp, err := a.TextGenerate(ctx, req)
	if err != nil {
		return nil, err
	}
	out := make(chan TextStreamEvent, 2)
	out <- TextStreamEvent{Role: "assistant", ContentDelta: resp.Content, FinishReason: resp.FinishReason, Usage: resp.Usage}
	out <- TextStreamEvent{Done: true}
	close(out)
	return out, nil
}

func (a *LocalAdapter) ResponsesGenerate(ctx context.Context, req ResponsesRequest) (TextResponse, error) {
	return a.TextGenerate(ctx, req.Text)
}

func (a *LocalAdapter) ImageGenerate(_ context.Context, req ImageRequest) (ImageResponse, error) {
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		prompt = "MovScript local image"
	}
	svg := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#101828"/><rect x="96" y="96" width="832" height="832" rx="48" fill="#2dd4bf"/><text x="512" y="512" text-anchor="middle" dominant-baseline="middle" font-family="Inter,Arial,sans-serif" font-size="48" fill="#101828">%s</text></svg>`, html.EscapeString(truncateLocalText(prompt, 42)))
	return ImageResponse{URLs: []string{"data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg))}}, nil
}

func (a *LocalAdapter) VideoGenerate(_ context.Context, req VideoRequest) (VideoResponse, error) {
	taskID := "local-video-" + base64.RawURLEncoding.EncodeToString([]byte(truncateLocalText(strings.TrimSpace(req.Prompt), 16)))
	return VideoResponse{
		TaskID:      taskID,
		TaskKind:    "local",
		Status:      VideoStatusSucceeded,
		Message:     "local video simulation completed",
		DurationSec: maxPositive(req.Duration, 1),
	}, nil
}

func (a *LocalAdapter) GenerateAudio(_ context.Context, req media.AudioGenerationRequest) (media.AudioGenerationResponse, error) {
	durationSec := req.DurationSec
	if durationSec <= 0 {
		durationSec = 2
	}
	if durationSec > 30 {
		durationSec = 30
	}
	frequency := 220.0
	providerKind := string(req.Kind)
	if req.Kind == media.AudioGenerationKindSoundEffect {
		frequency = 880.0
		providerKind = "sfx"
	} else if providerKind == "" {
		providerKind = "music"
	}
	audio := localToneWAV(durationSec, frequency, req.Kind == media.AudioGenerationKindSoundEffect)
	return media.AudioGenerationResponse{
		Audio:       audio,
		MimeType:    "audio/wav",
		DurationMs:  durationSec * 1000,
		ProviderRef: "local:" + providerKind + ":" + base64.RawURLEncoding.EncodeToString([]byte(truncateLocalText(strings.TrimSpace(req.Prompt), 16))),
	}, nil
}

func (a *LocalAdapter) GenerateSpeechToSpeech(_ context.Context, req media.SpeechToSpeechRequest) (media.SpeechToSpeechResponse, error) {
	durationSec := 2
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		prompt = "speech-to-speech"
	}
	audio := localToneWAV(durationSec, 440, false)
	return media.SpeechToSpeechResponse{
		Audio:       audio,
		Text:        "MovScript local speech-to-speech response: " + truncateLocalText(prompt, 120),
		MimeType:    "audio/wav",
		DurationMs:  durationSec * 1000,
		ProviderRef: "local:speech_to_speech:" + base64.RawURLEncoding.EncodeToString([]byte(truncateLocalText(prompt, 16))),
	}, nil
}

func (a *LocalAdapter) Transcribe(_ context.Context, req media.TranscribeRequest) (media.SubtitleResponse, error) {
	return media.SubtitleResponse{
		Content:     []byte("transcribed"),
		MimeType:    "text/plain",
		Format:      "txt",
		ProviderRef: "local:speech_to_text",
	}, nil
}

func (a *LocalAdapter) TranslateSpeech(_ context.Context, req media.SpeechTranslateRequest) (media.SubtitleResponse, error) {
	target := strings.TrimSpace(req.TargetLanguage)
	if target == "" {
		target = "en"
	}
	return media.SubtitleResponse{
		Content:     []byte("[local speech translation:" + target + "]\ntranslated audio\n"),
		MimeType:    "text/plain",
		Format:      "txt",
		ProviderRef: "local:speech_translate:" + target,
	}, nil
}

func (a *LocalAdapter) CloneVoice(_ context.Context, req media.VoiceCloneRequest) (media.VoiceProfileResponse, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "Local cloned voice"
	}
	voiceID := "local_clone_" + base64.RawURLEncoding.EncodeToString([]byte(truncateLocalText(name, 24)))
	return media.VoiceProfileResponse{
		VoiceID:     voiceID,
		Name:        name,
		Description: strings.TrimSpace(req.Description),
		ProviderRef: voiceID,
		Metadata: map[string]any{
			"sample_count": len(req.Samples),
			"provider":     "local",
		},
	}, nil
}

func (a *LocalAdapter) DesignVoice(_ context.Context, req media.VoiceDesignRequest) (media.VoiceProfileResponse, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "Local designed voice"
	}
	description := strings.TrimSpace(req.Description)
	if description == "" {
		description = "Designed local voice"
	}
	generatedID := "local_preview_" + base64.RawURLEncoding.EncodeToString([]byte(truncateLocalText(description, 24)))
	voiceID := "local_design_" + base64.RawURLEncoding.EncodeToString([]byte(truncateLocalText(name, 24)))
	return media.VoiceProfileResponse{
		VoiceID:          voiceID,
		Name:             name,
		Description:      description,
		GeneratedVoiceID: generatedID,
		ProviderRef:      voiceID,
		Metadata: map[string]any{
			"provider":     "local",
			"preview_text": strings.TrimSpace(req.PreviewText),
		},
	}, nil
}

func (a *LocalAdapter) Align(_ context.Context, req media.AlignRequest) (media.SubtitleResponse, error) {
	content := strings.TrimSpace(req.Script)
	if content == "" {
		content = "aligned"
	}
	return media.SubtitleResponse{
		Content:     []byte(content),
		MimeType:    "text/plain",
		Format:      "txt",
		ProviderRef: "local:forced_alignment",
	}, nil
}

func (a *LocalAdapter) GenerateDubbing(_ context.Context, req media.DubbingRequest) (media.SubtitleResponse, error) {
	target := strings.TrimSpace(req.TargetLanguage)
	if target == "" {
		target = "und"
	}
	source := strings.TrimSpace(string(req.Subtitle))
	if source == "" {
		source = "subtitle text"
	}
	content := fmt.Sprintf("[local subtitle translation:%s]\n%s\n", target, source)
	return media.SubtitleResponse{
		Content:     []byte(content),
		MimeType:    "text/plain",
		Format:      "txt",
		ProviderRef: "local:dubbing:" + target,
	}, nil
}

func (a *LocalAdapter) Ping(_ context.Context) error {
	return nil
}

func localTextResponse(req TextRequest) string {
	if req.JSONMode {
		return `{"provider":"local","status":"ok","message":"MovScript local AI gateway response"}`
	}
	userText := ""
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if strings.TrimSpace(req.Messages[i].Role) == "user" {
			userText = strings.TrimSpace(req.Messages[i].Content)
			break
		}
	}
	if userText == "" {
		userText = strings.TrimSpace(req.PromptName)
	}
	if userText == "" {
		userText = "request"
	}
	return "MovScript local AI gateway response: " + truncateLocalText(userText, 240)
}

func truncateLocalText(value string, limit int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit])
}

func localToneWAV(durationSec int, frequency float64, pulse bool) []byte {
	const sampleRate = 16000
	const channels = 1
	const bitsPerSample = 16
	sampleCount := durationSec * sampleRate
	dataSize := sampleCount * channels * bitsPerSample / 8
	var out bytes.Buffer
	out.WriteString("RIFF")
	_ = binary.Write(&out, binary.LittleEndian, uint32(36+dataSize))
	out.WriteString("WAVE")
	out.WriteString("fmt ")
	_ = binary.Write(&out, binary.LittleEndian, uint32(16))
	_ = binary.Write(&out, binary.LittleEndian, uint16(1))
	_ = binary.Write(&out, binary.LittleEndian, uint16(channels))
	_ = binary.Write(&out, binary.LittleEndian, uint32(sampleRate))
	_ = binary.Write(&out, binary.LittleEndian, uint32(sampleRate*channels*bitsPerSample/8))
	_ = binary.Write(&out, binary.LittleEndian, uint16(channels*bitsPerSample/8))
	_ = binary.Write(&out, binary.LittleEndian, uint16(bitsPerSample))
	out.WriteString("data")
	_ = binary.Write(&out, binary.LittleEndian, uint32(dataSize))
	for i := 0; i < sampleCount; i++ {
		amplitude := 0.18
		if pulse && (i/(sampleRate/8))%2 == 1 {
			amplitude = 0.02
		}
		sample := int16(math.Sin(2*math.Pi*frequency*float64(i)/sampleRate) * amplitude * math.MaxInt16)
		_ = binary.Write(&out, binary.LittleEndian, sample)
	}
	return out.Bytes()
}
