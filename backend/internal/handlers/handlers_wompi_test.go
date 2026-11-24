package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Vectores oficiales de https://docs.wompi.co (integridad del checkout y checksum de eventos).

func TestWompiIntegritySignature(t *testing.T) {
	got := wompiIntegritySignature("sk8-438k4-xmxm392-sn2m", 2490000, "COP", "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6")
	want := "37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5"
	if got != want {
		t.Fatalf("firma de integridad: got %s want %s", got, want)
	}
}

func eventBody(checksum string) []byte {
	return []byte(`{"event":"transaction.updated","data":{"transaction":{"id":"1234-1610641025-49201","status":"APPROVED","amount_in_cents":4490000,"reference":"MZQ3X2DE2SMX","currency":"COP"}},` +
		`"signature":{"properties":["transaction.id","transaction.status","transaction.amount_in_cents"],"checksum":"` + checksum + `"},"timestamp":1530291411,"sent_at":"2018-07-20T16:45:05.000Z"}`)
}

func TestVerifyWompiEvent(t *testing.T) {
	const secret = "prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z"
	// La doc publica 3476DDA5… para esta cadena, pero ese valor no corresponde a su SHA256 real;
	// este se calculó con `sha256sum` sobre la cadena de la doc (en mayúsculas para probar el case-insensitive).
	const good = "5A18EC5E8FDB7DF463E9F94774CBA8F583BA21BD04A09CEFF2EA68A4BC0AEFBE"

	check := func(body []byte, header, sec string) bool {
		var p wompiWebhookPayload
		if err := json.Unmarshal(body, &p); err != nil {
			t.Fatal(err)
		}
		return verifyWompiEvent(body, p, header, sec)
	}

	if !check(eventBody(good), "", secret) {
		t.Fatal("checksum válido (en mayúsculas) rechazado")
	}
	if !check(eventBody(""), good, secret) {
		t.Fatal("checksum válido por header X-Event-Checksum rechazado")
	}
	if check(eventBody(good), "", "otro_secreto") {
		t.Fatal("aceptó un secreto incorrecto")
	}
	if check(eventBody("00"+good[2:]), "", secret) {
		t.Fatal("aceptó un checksum alterado")
	}
	tampered := []byte(string(eventBody(good))[:0] + `{"event":"transaction.updated","data":{"transaction":{"id":"1234-1610641025-49201","status":"APPROVED","amount_in_cents":1,"reference":"X"}},"signature":{"properties":["transaction.id","transaction.status","transaction.amount_in_cents"],"checksum":"` + good + `"},"timestamp":1530291411}`)
	if check(tampered, "", secret) {
		t.Fatal("aceptó un monto alterado")
	}
}

// ─── Cliente de la API de Wompi (servidor falso) ──────────────────────────────

func fakeWompi(t *testing.T, handler http.HandlerFunc) *wompiClient {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return &wompiClient{base: srv.URL, key: "prv_test_fake", http: srv.Client()}
}

func TestWompiClientEnviaLlavePrivadaYParseaTransaccion(t *testing.T) {
	var gotAuth, gotPath string
	c := fakeWompi(t, func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotPath = r.Header.Get("Authorization"), r.URL.Path
		fmt.Fprint(w, `{"data":{"id":"123-456-789","status":"APPROVED","status_message":null,"amount_in_cents":1000000,"currency":"COP","reference":"MANO-49-1","payment_method_type":"NEQUI","finalized_at":"2026-11-24T08:10:00.000Z","created_at":"2026-11-24T08:09:00.000Z"}}`)
	})
	d, err := c.transactionByID("123-456-789")
	if err != nil || d == nil {
		t.Fatalf("esperaba datos, got %v %v", d, err)
	}
	if gotAuth != "Bearer prv_test_fake" || gotPath != "/transactions/123-456-789" {
		t.Fatalf("petición incorrecta: auth=%q path=%q", gotAuth, gotPath)
	}
	if d.Status != "APPROVED" || d.AmountInCents != 1000000 || d.PaymentMethod != "NEQUI" || d.FinalizedAt == nil || d.StatusMessage != "" {
		t.Fatalf("parseo incorrecto: %+v", d)
	}
}

func TestWompiClientNoExisteYErroresTransitorios(t *testing.T) {
	c404 := fakeWompi(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(404) })
	if d, err := c404.transactionByID("abc"); d != nil || err != nil {
		t.Fatalf("404 debe ser (nil,nil), got %v %v", d, err)
	}
	for _, code := range []int{429, 500, 502, 503} {
		code := code
		c := fakeWompi(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(code) })
		if _, err := c.transactionByID("abc"); !errors.Is(err, errWompiUnavailable) {
			t.Fatalf("HTTP %d debe ser errWompiUnavailable, got %v", code, err)
		}
	}
}

func TestWompiClientRechazaIdsPeligrosos(t *testing.T) {
	llamado := false
	c := fakeWompi(t, func(w http.ResponseWriter, r *http.Request) { llamado = true })
	for _, bad := range []string{"", "../admin", "a/b", "x?y=1", "a b", strings.Repeat("a", 65)} {
		if d, err := c.transactionByID(bad); d != nil || err != nil {
			t.Fatalf("id %q debe ignorarse", bad)
		}
		if d, err := c.transactionByReference(bad); d != nil || err != nil {
			t.Fatalf("referencia %q debe ignorarse", bad)
		}
	}
	if llamado {
		t.Fatal("no debe llamar a Wompi con ids inválidos")
	}
}

func TestPickWompiTransaction(t *testing.T) {
	list := []wompiAPITx{
		{ID: "a", Status: "ERROR", CreatedAt: "2026-11-24T08:00:00Z"},
		{ID: "b", Status: "DECLINED", CreatedAt: "2026-11-24T08:05:00Z"},
	}
	if got := pickWompiTransaction(list); got.ID != "b" {
		t.Fatalf("sin aprobada: debe elegir la más reciente, got %s", got.ID)
	}
	list = append(list, wompiAPITx{ID: "c", Status: "APPROVED", CreatedAt: "2026-11-24T07:00:00Z"})
	if got := pickWompiTransaction(list); got.ID != "c" {
		t.Fatalf("con aprobada: debe elegirla siempre, got %s", got.ID)
	}
	if pickWompiTransaction(nil) != nil {
		t.Fatal("lista vacía debe dar nil")
	}
}

func TestConfirmWompiApproval(t *testing.T) {
	resp := `{"data":{"id":"T1","status":"APPROVED","amount_in_cents":600000,"currency":"COP","reference":"MANO-1-1","created_at":"2026-11-24T08:00:00Z"}}`
	c := fakeWompi(t, func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, resp) })
	ev := wompiTxData{ID: "T1", Reference: "MANO-1-1", Status: "APPROVED", Currency: "COP", AmountInCents: 600000}
	if d, err := confirmWompiApproval(c, ev); err != nil || d == nil {
		t.Fatalf("debía confirmar: %v %v", d, err)
	}
	// Un atacante con el checksum robado no puede cambiar el monto ni la referencia.
	for name, mod := range map[string]func(*wompiTxData){
		"monto distinto":      func(e *wompiTxData) { e.AmountInCents = 100 },
		"referencia distinta": func(e *wompiTxData) { e.Reference = "MANO-2-2" },
		"moneda distinta":     func(e *wompiTxData) { e.Currency = "USD" },
	} {
		e := ev
		mod(&e)
		if d, err := confirmWompiApproval(c, e); d != nil || err != nil {
			t.Fatalf("%s: no debe confirmar, got %v %v", name, d, err)
		}
	}
	resp = `{"data":{"id":"T1","status":"DECLINED","amount_in_cents":600000,"currency":"COP","reference":"MANO-1-1"}}`
	if d, _ := confirmWompiApproval(c, ev); d != nil {
		t.Fatal("si Wompi dice DECLINED no debe confirmar un APPROVED")
	}
}

func TestWompiAPIBase(t *testing.T) {
	t.Setenv("WOMPI_API_BASE", "")
	t.Setenv("WOMPI_PUBLIC_KEY", "pub_test_x")
	if got := wompiAPIBase(); got != "https://sandbox.wompi.co/v1" {
		t.Fatalf("pub_test_ debe usar sandbox, got %s", got)
	}
	t.Setenv("WOMPI_PUBLIC_KEY", "pub_prod_x")
	if got := wompiAPIBase(); got != "https://production.wompi.co/v1" {
		t.Fatalf("pub_prod_ debe usar producción, got %s", got)
	}
	t.Setenv("WOMPI_API_BASE", "http://127.0.0.1:9/v1/")
	if got := wompiAPIBase(); got != "http://127.0.0.1:9/v1" {
		t.Fatalf("WOMPI_API_BASE manda, got %s", got)
	}
}

func TestClampInt(t *testing.T) {
	cases := []struct {
		in            string
		def, min, max int
		want          int
	}{{"", 50, 1, 100, 50}, {"20", 50, 1, 100, 20}, {"0", 50, 1, 100, 1}, {"9999", 50, 1, 100, 100}, {"-5", 50, 1, 100, 50}, {"abc", 50, 1, 100, 50}}
	for _, c := range cases {
		if got := clampInt(c.in, c.def, c.min, c.max); got != c.want {
			t.Fatalf("clampInt(%q)=%d want %d", c.in, got, c.want)
		}
	}
}
