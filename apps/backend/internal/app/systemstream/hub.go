package systemstream

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"
)

const (
	TopicGenerationJob = "generation-job"
	TopicCapability    = "capability"
	TopicResource      = "resource"
	TopicProject       = "project"
	TopicOrg           = "org"
	TopicSystem        = "system"

	ScopeGlobal  = "global"
	ScopeSystem  = "system"
	ScopeUser    = "user"
	ScopeOrg     = "org"
	ScopeProject = "project"
)

const (
	TypeSystemConnected = "system.connected"

	TypeJobStatusChanged = "job.status.changed"

	TypeResourceChanged       = "resource.changed"
	TypeResourceStatusChanged = "resource.status.changed"

	TypeProjectChanged = "project.changed"
	TypeOrgChanged     = "org.changed"

	TypeCapabilityChanged = "capability.changed"
)

type Scope struct {
	Kind string `json:"kind"`
	ID   string `json:"id,omitempty"`
}

type Entity struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type Message struct {
	ID        string    `json:"id"`
	Topic     string    `json:"topic"`
	Type      string    `json:"type"`
	Scope     Scope     `json:"scope"`
	Source    string    `json:"source,omitempty"`
	EmittedAt time.Time `json:"emittedAt"`
	Entity    *Entity   `json:"entity,omitempty"`
	ProjectID uint      `json:"projectId,omitempty"`
	Payload   any       `json:"payload,omitempty"`
}

type Subscriber struct {
	id     string
	ch     chan Message
	filter Filter
}

type Filter struct {
	Topics     []string
	ScopeKinds []string
}

type Hub struct {
	mu          sync.RWMutex
	nextID      uint64
	subscribers map[string]*Subscriber
}

func NewHub() *Hub {
	return &Hub{subscribers: make(map[string]*Subscriber)}
}

func (h *Hub) Subscribe(buffer int) (*Subscriber, func()) {
	return h.SubscribeFiltered(buffer, Filter{})
}

func (h *Hub) SubscribeFiltered(buffer int, filter Filter) (*Subscriber, func()) {
	if h == nil {
		h = NewHub()
	}
	if buffer <= 0 {
		buffer = 64
	}
	sub := &Subscriber{
		id:     fmt.Sprintf("%d-%s", time.Now().UnixNano(), randomSuffix()),
		ch:     make(chan Message, buffer),
		filter: normalizeFilter(filter),
	}
	h.mu.Lock()
	h.subscribers[sub.id] = sub
	h.mu.Unlock()

	var once sync.Once
	unsubscribe := func() {
		once.Do(func() {
			h.mu.Lock()
			if current, ok := h.subscribers[sub.id]; ok && current == sub {
				delete(h.subscribers, sub.id)
				close(sub.ch)
			}
			h.mu.Unlock()
		})
	}
	return sub, unsubscribe
}

func (s *Subscriber) Messages() <-chan Message {
	if s == nil {
		return nil
	}
	return s.ch
}

func (h *Hub) Publish(message Message) Message {
	if h == nil {
		return message
	}
	message = normalizeMessage(message)

	h.mu.RLock()
	subscribers := make([]*Subscriber, 0, len(h.subscribers))
	for _, sub := range h.subscribers {
		subscribers = append(subscribers, sub)
	}
	h.mu.RUnlock()

	for _, sub := range subscribers {
		if !sub.filter.Allows(message) {
			continue
		}
		select {
		case sub.ch <- message:
		default:
		}
	}
	return message
}

func NewMessage(topic string, scope Scope, payload any) Message {
	return normalizeMessage(Message{
		Topic:   topic,
		Scope:   scope,
		Payload: payload,
	})
}

func NewEvent(topic string, eventType string, scope Scope, entity *Entity, payload any) Message {
	return normalizeMessage(Message{
		Topic:   topic,
		Type:    eventType,
		Scope:   scope,
		Entity:  entity,
		Payload: payload,
	})
}

func UserScope(userID uint) Scope {
	if userID == 0 {
		return Scope{Kind: ScopeGlobal}
	}
	return Scope{Kind: ScopeUser, ID: fmt.Sprintf("%d", userID)}
}

func OrgScope(orgID uint) Scope {
	if orgID == 0 {
		return Scope{Kind: ScopeGlobal}
	}
	return Scope{Kind: ScopeOrg, ID: fmt.Sprintf("%d", orgID)}
}

func ProjectScope(projectID uint) Scope {
	if projectID == 0 {
		return Scope{Kind: ScopeGlobal}
	}
	return Scope{Kind: ScopeProject, ID: fmt.Sprintf("%d", projectID)}
}

func EntityRef(entityType string, id uint) *Entity {
	if entityType == "" || id == 0 {
		return nil
	}
	return &Entity{Type: entityType, ID: fmt.Sprintf("%d", id)}
}

func normalizeMessage(message Message) Message {
	if message.ID == "" {
		message.ID = fmt.Sprintf("sys-%d-%s", time.Now().UnixNano(), randomSuffix())
	}
	if message.Topic == "" {
		message.Topic = TopicSystem
	}
	if message.Scope.Kind == "" {
		message.Scope.Kind = ScopeGlobal
	}
	message.Scope.Kind = normalizeToken(message.Scope.Kind)
	message.Topic = normalizeToken(message.Topic)
	message.Type = strings.TrimSpace(message.Type)
	if message.EmittedAt.IsZero() {
		message.EmittedAt = time.Now().UTC()
	}
	if message.Source == "" {
		message.Source = "backend"
	}
	return message
}

func normalizeFilter(filter Filter) Filter {
	return Filter{
		Topics:     normalizeTokenSet(filter.Topics),
		ScopeKinds: normalizeTokenSet(filter.ScopeKinds),
	}
}

func (f Filter) Allows(message Message) bool {
	if len(f.Topics) > 0 && !containsToken(f.Topics, message.Topic) {
		return false
	}
	if len(f.ScopeKinds) > 0 && !containsToken(f.ScopeKinds, message.Scope.Kind) {
		return false
	}
	return true
}

func normalizeTokenSet(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		token := normalizeToken(value)
		if token == "" {
			continue
		}
		if _, ok := seen[token]; ok {
			continue
		}
		seen[token] = struct{}{}
		out = append(out, token)
	}
	return out
}

func containsToken(values []string, value string) bool {
	value = normalizeToken(value)
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}

func normalizeToken(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func randomSuffix() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "00000000"
	}
	return hex.EncodeToString(b[:])
}
