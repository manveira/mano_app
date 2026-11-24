package config

import (
	"strings"
	"testing"
)

func TestValidate(t *testing.T) {
	casos := []struct {
		nombre string
		cfg    Config
		falla  bool
	}{
		{"mock: sin secreto es válido (desarrollo)", Config{MockMode: true}, false},
		{"producción: secreto por defecto", Config{JWTSecret: "replace-this-secret"}, true},
		{"producción: secreto vacío", Config{}, true},
		{"producción: secreto corto", Config{JWTSecret: "corto"}, true},
		{"producción: secreto de 32+", Config{JWTSecret: strings.Repeat("a", 32)}, false},
	}
	for _, c := range casos {
		err := c.cfg.Validate()
		if (err != nil) != c.falla {
			t.Errorf("%s: err=%v, falla esperada=%v", c.nombre, err, c.falla)
		}
	}
}
