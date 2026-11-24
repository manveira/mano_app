package database

import "testing"

func TestShouldSeedDemo(t *testing.T) {
	casos := []struct {
		seed, mock string
		want       bool
	}{
		{"", "true", true},   // desarrollo/CI: se siembra
		{"", "false", false}, // producción: no se siembra por defecto
		{"", "", false},      // sin nada: no se siembra
		{"true", "false", true},
		{"false", "true", false}, // SEED_DEMO_DATA manda sobre MOCK_MODE
		{"FALSE", "true", false},
		{"1", "", true},
		{"0", "true", false},
	}
	for _, c := range casos {
		t.Setenv("SEED_DEMO_DATA", c.seed)
		t.Setenv("MOCK_MODE", c.mock)
		if got := shouldSeedDemo(); got != c.want {
			t.Errorf("SEED_DEMO_DATA=%q MOCK_MODE=%q: got %v want %v", c.seed, c.mock, got, c.want)
		}
	}
}
