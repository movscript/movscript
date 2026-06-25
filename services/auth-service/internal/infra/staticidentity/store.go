package staticidentity

import (
	"context"
	"encoding/json"
	"strings"
	"sync"

	domainauth "github.com/movscript/auth-service/internal/domain/auth"
)

type Config struct {
	Users          []domainauth.UserProfile    `json:"users,omitempty"`
	OrgMemberships []OrgMembershipConfigRecord `json:"org_memberships,omitempty"`
}

type OrgMembershipConfigRecord struct {
	UserID uint `json:"user_id"`
	domainauth.OrgMembership
}

type Store struct {
	mu                sync.RWMutex
	users             map[uint]domainauth.UserProfile
	membershipsByUser map[uint][]domainauth.OrgMembership
}

func New(config Config) *Store {
	store := &Store{
		users:             map[uint]domainauth.UserProfile{},
		membershipsByUser: map[uint][]domainauth.OrgMembership{},
	}
	for _, user := range config.Users {
		if user.ID == 0 {
			continue
		}
		store.users[user.ID] = user
	}
	for _, membership := range config.OrgMemberships {
		if membership.UserID == 0 || membership.OrgID == 0 {
			continue
		}
		store.membershipsByUser[membership.UserID] = append(store.membershipsByUser[membership.UserID], membership.OrgMembership)
	}
	return store
}

func FromJSON(value string) (*Store, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return New(Config{}), nil
	}
	var config Config
	if err := json.Unmarshal([]byte(value), &config); err != nil {
		return nil, err
	}
	return New(config), nil
}

func (s *Store) UserProfile(_ context.Context, userID uint) (domainauth.UserProfile, bool, error) {
	if s == nil {
		return domainauth.UserProfile{}, false, nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	profile, ok := s.users[userID]
	return profile, ok, nil
}

func (s *Store) OrgMemberships(_ context.Context, userID uint) ([]domainauth.OrgMembership, bool, error) {
	if s == nil {
		return nil, false, nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.users[userID]; !ok {
		return nil, false, nil
	}
	memberships := s.membershipsByUser[userID]
	out := make([]domainauth.OrgMembership, len(memberships))
	copy(out, memberships)
	return out, true, nil
}
