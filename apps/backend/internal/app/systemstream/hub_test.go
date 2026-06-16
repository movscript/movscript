package systemstream

import (
	"testing"
	"time"
)

func TestHubPublishesToSubscribers(t *testing.T) {
	hub := NewHub()
	sub, unsubscribe := hub.Subscribe(1)
	defer unsubscribe()

	published := hub.Publish(Message{
		Topic:  TopicGenerationJob,
		Type:   TypeJobStatusChanged,
		Scope:  Scope{Kind: ScopeUser, ID: "42"},
		Entity: EntityRef("job", 7),
		Payload: map[string]string{
			"status": "running",
		},
	})

	select {
	case received := <-sub.Messages():
		if received.ID == "" {
			t.Fatal("expected generated message id")
		}
		if received.ID != published.ID {
			t.Fatalf("expected message %q, got %q", published.ID, received.ID)
		}
		if received.Topic != TopicGenerationJob {
			t.Fatalf("expected topic %q, got %q", TopicGenerationJob, received.Topic)
		}
		if received.Type != TypeJobStatusChanged {
			t.Fatalf("expected type %q, got %q", TypeJobStatusChanged, received.Type)
		}
		if received.Entity == nil || received.Entity.Type != "job" || received.Entity.ID != "7" {
			t.Fatalf("expected job entity, got %+v", received.Entity)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for message")
	}
}

func TestPublishDoesNotBlockOnSlowSubscriber(t *testing.T) {
	hub := NewHub()
	_, unsubscribe := hub.Subscribe(1)
	defer unsubscribe()

	hub.Publish(Message{Topic: TopicSystem})

	done := make(chan struct{})
	go func() {
		hub.Publish(Message{Topic: TopicCapability})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("publish blocked on a full subscriber buffer")
	}
}

func TestSubscribeFilteredReceivesMatchingMessagesOnly(t *testing.T) {
	hub := NewHub()
	sub, unsubscribe := hub.SubscribeFiltered(4, Filter{
		Topics:     []string{TopicResource},
		ScopeKinds: []string{ScopeOrg},
	})
	defer unsubscribe()

	hub.Publish(Message{Topic: TopicGenerationJob, Scope: Scope{Kind: ScopeOrg, ID: "7"}})
	hub.Publish(Message{Topic: TopicResource, Scope: Scope{Kind: ScopeUser, ID: "42"}})
	expected := hub.Publish(Message{Topic: TopicResource, Scope: Scope{Kind: ScopeOrg, ID: "7"}})

	select {
	case received := <-sub.Messages():
		if received.ID != expected.ID {
			t.Fatalf("expected matching message %q, got %q", expected.ID, received.ID)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for filtered message")
	}

	select {
	case extra := <-sub.Messages():
		t.Fatalf("unexpected extra message: %+v", extra)
	default:
	}
}

func TestNewEventNormalizesDefaults(t *testing.T) {
	message := NewEvent(TopicProject, TypeProjectChanged, ProjectScope(11), EntityRef("project", 11), map[string]string{"reason": "member_changed"})

	if message.ID == "" {
		t.Fatal("expected generated message id")
	}
	if message.Topic != TopicProject {
		t.Fatalf("expected topic %q, got %q", TopicProject, message.Topic)
	}
	if message.Type != TypeProjectChanged {
		t.Fatalf("expected type %q, got %q", TypeProjectChanged, message.Type)
	}
	if message.Scope.Kind != ScopeProject || message.Scope.ID != "11" {
		t.Fatalf("expected project scope, got %+v", message.Scope)
	}
	if message.Entity == nil || message.Entity.ID != "11" {
		t.Fatalf("expected project entity, got %+v", message.Entity)
	}
}
