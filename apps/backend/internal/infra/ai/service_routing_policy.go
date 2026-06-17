package ai

import (
	"fmt"
	"sort"
	"sync"
	"sync/atomic"
)

var priorityRoundRobinCounters sync.Map

var defaultRuntimeRoutingPolicy = runtimeRoutingPolicy{
	counters: &priorityRoundRobinCounters,
}

type runtimeRoutingPolicy struct {
	counters *sync.Map
}

func runtimeModelRoundRobinKey(logicalID, capability string) string {
	return "service.runtime_model:" + capability + ":" + logicalID
}

func runtimeModelAttemptOrder(key string, candidates []runtimeModelCandidate) []runtimeModelCandidate {
	return defaultRuntimeRoutingPolicy.orderCandidates(key, candidates)
}

func (p runtimeRoutingPolicy) orderCandidates(key string, candidates []runtimeModelCandidate) []runtimeModelCandidate {
	if len(candidates) <= 1 {
		return append([]runtimeModelCandidate(nil), candidates...)
	}
	byPriority := map[int][]runtimeModelCandidate{}
	var priorities []int
	for _, candidate := range candidates {
		if _, ok := byPriority[candidate.priority]; !ok {
			priorities = append(priorities, candidate.priority)
		}
		byPriority[candidate.priority] = append(byPriority[candidate.priority], candidate)
	}
	sort.Slice(priorities, func(i, j int) bool { return priorities[i] > priorities[j] })
	ordered := make([]runtimeModelCandidate, 0, len(candidates))
	for _, priority := range priorities {
		group := byPriority[priority]
		if len(group) > 1 {
			weighted := weightedRuntimeCandidateGroup(group)
			counter := p.counter(key + ":attempts:" + fmt.Sprint(priority))
			offset := int((atomic.AddUint64(counter, 1) - 1) % uint64(len(weighted)))
			group = dedupeRuntimeCandidateGroup(append(append([]runtimeModelCandidate(nil), weighted[offset:]...), weighted[:offset]...))
			sort.SliceStable(group, func(i, j int) bool {
				left := runtimeProviderHealthSnapshot(group[i].id)
				right := runtimeProviderHealthSnapshot(group[j].id)
				if leftSaturated, rightSaturated := runtimeCandidateSaturated(group[i], left), runtimeCandidateSaturated(group[j], right); leftSaturated != rightSaturated {
					return !leftSaturated
				}
				if left.open != right.open {
					return !left.open
				}
				if left.inFlight != right.inFlight {
					return left.inFlight < right.inFlight
				}
				if left.failureRate != right.failureRate {
					return left.failureRate < right.failureRate
				}
				return false
			})
		}
		ordered = append(ordered, group...)
	}
	return ordered
}

func weightedRuntimeCandidateGroup(group []runtimeModelCandidate) []runtimeModelCandidate {
	weighted := make([]runtimeModelCandidate, 0, len(group))
	for _, candidate := range group {
		for range runtimeCandidateCapacityWeight(candidate) {
			weighted = append(weighted, candidate)
		}
	}
	return weighted
}

func dedupeRuntimeCandidateGroup(group []runtimeModelCandidate) []runtimeModelCandidate {
	seen := make(map[uint]bool, len(group))
	out := make([]runtimeModelCandidate, 0, len(group))
	for _, candidate := range group {
		if seen[candidate.id] {
			continue
		}
		seen[candidate.id] = true
		out = append(out, candidate)
	}
	return out
}

func runtimeCandidateCapacityWeight(candidate runtimeModelCandidate) int {
	if candidate.capacityWeight > 0 {
		return candidate.capacityWeight
	}
	return 1
}

func runtimeCandidateSaturated(candidate runtimeModelCandidate, view runtimeProviderHealthView) bool {
	return candidate.maxConcurrency > 0 && view.inFlight >= candidate.maxConcurrency
}

func operationTypeForCapability(capability string) string {
	switch capability {
	case CapabilityReasoning:
		return CapabilityText
	case CapabilityImageEdit:
		return CapabilityImage
	case CapabilityVideoI2V, CapabilityVideoV2V:
		return CapabilityVideo
	default:
		return capability
	}
}

// pickByPriority selects one item from a slice by priority.
// All items with the maximum priority value are collected, then one is chosen in round-robin order.
func pickByPriority[T any](key string, items []T, priority func(T) int) T {
	return pickByPriorityWithPolicy(defaultRuntimeRoutingPolicy, key, items, priority)
}

func pickByPriorityWithPolicy[T any](policy runtimeRoutingPolicy, key string, items []T, priority func(T) int) T {
	if len(items) == 0 {
		var zero T
		return zero
	}
	maxP := priority(items[0])
	for _, item := range items[1:] {
		if p := priority(item); p > maxP {
			maxP = p
		}
	}
	var top []T
	for _, item := range items {
		if priority(item) == maxP {
			top = append(top, item)
		}
	}
	if len(top) == 1 {
		return top[0]
	}
	counter := policy.counter(key)
	index := atomic.AddUint64(counter, 1) - 1
	return top[int(index%uint64(len(top)))]
}

func (p runtimeRoutingPolicy) counter(key string) *uint64 {
	value, _ := p.counters.LoadOrStore(key, new(uint64))
	return value.(*uint64)
}
