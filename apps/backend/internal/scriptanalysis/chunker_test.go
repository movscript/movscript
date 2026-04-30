package scriptanalysis

import (
	"strings"
	"testing"
)

func TestChunkTextKeepsShortContentInOneChunk(t *testing.T) {
	chunks := ChunkText("第一场\n第二场", 100)

	if len(chunks) != 1 {
		t.Fatalf("chunk count = %d, want 1", len(chunks))
	}
	if chunks[0].Index != 1 || chunks[0].Total != 1 {
		t.Fatalf("chunk metadata = %+v, want 1/1", chunks[0])
	}
	if chunks[0].Text != "第一场\n第二场" {
		t.Fatalf("chunk text = %q", chunks[0].Text)
	}
}

func TestChunkTextSplitsByLineBoundary(t *testing.T) {
	chunks := ChunkText("aaaa\nbbbb\ncccc", 9)

	if len(chunks) != 2 {
		t.Fatalf("chunk count = %d, want 2: %+v", len(chunks), chunks)
	}
	if chunks[0].Text != "aaaa\nbbbb" {
		t.Fatalf("first chunk = %q", chunks[0].Text)
	}
	if chunks[1].Text != "cccc" {
		t.Fatalf("second chunk = %q", chunks[1].Text)
	}
	if chunks[0].Total != 2 || chunks[1].Total != 2 {
		t.Fatalf("chunk totals = %d/%d, want 2", chunks[0].Total, chunks[1].Total)
	}
}

func TestChunkTextSplitsVeryLongLine(t *testing.T) {
	chunks := ChunkText(strings.Repeat("你", 25), 10)

	if len(chunks) != 3 {
		t.Fatalf("chunk count = %d, want 3", len(chunks))
	}
	if got := len([]rune(chunks[0].Text)); got != 10 {
		t.Fatalf("first chunk rune length = %d, want 10", got)
	}
	if got := len([]rune(chunks[2].Text)); got != 5 {
		t.Fatalf("last chunk rune length = %d, want 5", got)
	}
}
