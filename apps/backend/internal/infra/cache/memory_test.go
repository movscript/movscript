package cache

import (
	"context"
	"testing"
	"time"
)

func TestMemoryCacheJSONRoundTrip(t *testing.T) {
	c := NewMemory()
	ctx := context.Background()
	value := struct {
		Name string `json:"name"`
	}{Name: "model-list"}

	if err := c.SetJSON(ctx, "key", value, time.Minute); err != nil {
		t.Fatalf("SetJSON returned error: %v", err)
	}

	var got struct {
		Name string `json:"name"`
	}
	ok, err := c.GetJSON(ctx, "key", &got)
	if err != nil {
		t.Fatalf("GetJSON returned error: %v", err)
	}
	if !ok {
		t.Fatal("GetJSON returned cache miss")
	}
	if got.Name != value.Name {
		t.Fatalf("GetJSON decoded %q, want %q", got.Name, value.Name)
	}
}

func TestMemoryCacheExpires(t *testing.T) {
	c := NewMemory()
	ctx := context.Background()
	if err := c.SetJSON(ctx, "key", map[string]string{"value": "x"}, time.Nanosecond); err != nil {
		t.Fatalf("SetJSON returned error: %v", err)
	}
	time.Sleep(time.Millisecond)

	var got map[string]string
	ok, err := c.GetJSON(ctx, "key", &got)
	if err != nil {
		t.Fatalf("GetJSON returned error: %v", err)
	}
	if ok {
		t.Fatal("GetJSON returned hit for expired key")
	}
}

func TestMemoryCacheBumpVersion(t *testing.T) {
	c := NewMemory()
	ctx := context.Background()
	initial, err := c.GetVersion(ctx, "models")
	if err != nil {
		t.Fatalf("GetVersion returned error: %v", err)
	}
	if initial != 0 {
		t.Fatalf("initial version = %d; want 0", initial)
	}
	first, err := c.BumpVersion(ctx, "models")
	if err != nil {
		t.Fatalf("BumpVersion returned error: %v", err)
	}
	second, err := c.BumpVersion(ctx, "models")
	if err != nil {
		t.Fatalf("BumpVersion returned error: %v", err)
	}
	if first != 1 || second != 2 {
		t.Fatalf("versions = %d, %d; want 1, 2", first, second)
	}
	current, err := c.GetVersion(ctx, "models")
	if err != nil {
		t.Fatalf("GetVersion returned error: %v", err)
	}
	if current != 2 {
		t.Fatalf("current version = %d; want 2", current)
	}
}
