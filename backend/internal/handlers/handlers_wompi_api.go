package handlers

// handlers_wompi_api.go — Verificación servidor↔Wompi, aplicación única de estados de pago y conciliación.
//
// Principio de seguridad: el webhook solo AVISA; el dinero se marca como recibido tras confirmar con la API de
// Wompi (llave privada, TLS) cuando hay llave privada configurada. Además, un conciliador revisa periódicamente
// los pagos pendientes, de modo que un webhook perdido no deja una orden pagada como pendiente.
//
// Un solo punto aplica los cambios (applyWompiTransaction), usado por webhook, sync y conciliador:
// transacción de BD + bloqueo de fila + idempotencia + validación de monto/moneda + bitácora (WompiEvent).

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"mano-app/backend/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// errWompiIgnored marca eventos válidos que no corresponden a una transacción nuestra o que no deben cambiar nada.
// Se responde 200 para que Wompi no reintente.
var errWompiIgnored = errors.New("event ignored")

// errWompiUnavailable marca fallos transitorios al hablar con Wompi (red, 5xx, 429): conviene reintentar.
var errWompiUnavailable = errors.New("wompi unavailable")

var wompiIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// wompiTxData es lo que sabemos de una transacción de Wompi (de un webhook firmado o confirmado por la API).
type wompiTxData struct {
	ID            string
	Reference     string
	Status        string
	StatusMessage string
	Currency      string
	PaymentMethod string
	AmountInCents int64
	FinalizedAt   *time.Time
}

// ─── Cliente de la API de Wompi ───────────────────────────────────────────────

type wompiClient struct {
	base string
	key  string
	http *http.Client
}

// wompiAPIBase decide el ambiente: WOMPI_API_BASE manda; si no, la llave pública (pub_prod_ → producción; resto → sandbox).
func wompiAPIBase() string {
	if v := strings.TrimRight(os.Getenv("WOMPI_API_BASE"), "/"); v != "" {
		return v
	}
	if strings.HasPrefix(os.Getenv("WOMPI_PUBLIC_KEY"), "pub_prod_") {
		return "https://production.wompi.co/v1"
	}
	return "https://sandbox.wompi.co/v1"
}

// newWompiClient devuelve nil si no hay llave privada (entonces no se puede verificar contra Wompi).
func newWompiClient() *wompiClient {
	key := os.Getenv("WOMPI_PRIVATE_KEY")
	if key == "" {
		return nil
	}
	return &wompiClient{base: wompiAPIBase(), key: key, http: &http.Client{Timeout: 10 * time.Second}}
}

type wompiAPITx struct {
	ID                string  `json:"id"`
	Status            string  `json:"status"`
	StatusMessage     *string `json:"status_message"`
	AmountInCents     int64   `json:"amount_in_cents"`
	Currency          string  `json:"currency"`
	Reference         string  `json:"reference"`
	PaymentMethodType string  `json:"payment_method_type"`
	FinalizedAt       *string `json:"finalized_at"`
	CreatedAt         string  `json:"created_at"`
}

func (t wompiAPITx) toData() *wompiTxData {
	d := &wompiTxData{
		ID: t.ID, Reference: t.Reference, Status: t.Status, Currency: t.Currency,
		PaymentMethod: t.PaymentMethodType, AmountInCents: t.AmountInCents,
	}
	if t.StatusMessage != nil {
		d.StatusMessage = *t.StatusMessage
	}
	if t.FinalizedAt != nil {
		if ts, err := time.Parse(time.RFC3339, *t.FinalizedAt); err == nil {
			d.FinalizedAt = &ts
		}
	}
	return d
}

// pickWompiTransaction elige la transacción relevante de una referencia: una APPROVED si existe; si no, la más reciente.
func pickWompiTransaction(list []wompiAPITx) *wompiAPITx {
	var best *wompiAPITx
	for i := range list {
		t := &list[i]
		if t.Status == "APPROVED" {
			return t
		}
		if best == nil || t.CreatedAt > best.CreatedAt {
			best = t
		}
	}
	return best
}

// get hace un GET autenticado y decodifica el JSON. Devuelve el status HTTP. Nunca registra cuerpos ni llaves.
func (c *wompiClient) get(path string, out interface{}) (int, error) {
	req, err := http.NewRequest(http.MethodGet, c.base+path, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+c.key)
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, fmt.Errorf("%w: %v", errWompiUnavailable, redactURLError(err))
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
		return resp.StatusCode, fmt.Errorf("%w: HTTP %d", errWompiUnavailable, resp.StatusCode)
	}
	if resp.StatusCode == http.StatusOK && out != nil {
		if err := json.Unmarshal(body, out); err != nil {
			return resp.StatusCode, fmt.Errorf("respuesta de Wompi ilegible: %w", err)
		}
	}
	return resp.StatusCode, nil
}

// redactURLError evita filtrar la URL completa (y con ello datos) en los logs.
func redactURLError(err error) string {
	var ue *url.Error
	if errors.As(err, &ue) {
		return ue.Err.Error()
	}
	return err.Error()
}

// transactionByID consulta GET /transactions/{id}. (nil, nil) si Wompi no la conoce.
func (c *wompiClient) transactionByID(id string) (*wompiTxData, error) {
	if !wompiIDRe.MatchString(id) {
		return nil, nil
	}
	var out struct {
		Data wompiAPITx `json:"data"`
	}
	code, err := c.get("/transactions/"+url.PathEscape(id), &out)
	if err != nil {
		return nil, err
	}
	if code == http.StatusNotFound || out.Data.ID == "" {
		return nil, nil
	}
	if code != http.StatusOK {
		return nil, fmt.Errorf("wompi respondió HTTP %d", code)
	}
	return out.Data.toData(), nil
}

// transactionByReference consulta GET /transactions?reference=… (nil, nil) si aún no hay transacción.
func (c *wompiClient) transactionByReference(ref string) (*wompiTxData, error) {
	if !wompiIDRe.MatchString(ref) {
		return nil, nil
	}
	var out struct {
		Data []wompiAPITx `json:"data"`
	}
	code, err := c.get("/transactions?reference="+url.QueryEscape(ref), &out)
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, fmt.Errorf("wompi respondió HTTP %d", code)
	}
	if t := pickWompiTransaction(out.Data); t != nil {
		return t.toData(), nil
	}
	return nil, nil
}

// confirmWompiApproval verifica contra Wompi que un APPROVED anunciado por webhook sea real y coincida.
// (nil, nil) = Wompi no confirma (no existe, otro estado, o monto/referencia distintos): se ignora el evento.
// error con errWompiUnavailable = no se pudo verificar: responder 503 para que Wompi reintente.
func confirmWompiApproval(c *wompiClient, ev wompiTxData) (*wompiTxData, error) {
	remote, err := c.transactionByID(ev.ID)
	if err != nil {
		return nil, err
	}
	if remote == nil || remote.Status != "APPROVED" || remote.Reference != ev.Reference ||
		remote.AmountInCents != ev.AmountInCents || (ev.Currency != "" && remote.Currency != ev.Currency) {
		return nil, nil
	}
	return remote, nil
}

// ─── Aplicación única de estados ──────────────────────────────────────────────

// applyWompiTransaction aplica un estado FINAL de Wompi a nuestra transacción y a la orden. Devuelve si cambió algo.
// Los casos que no deben cambiar nada devuelven un error que envuelve errWompiIgnored.
func (h *Handler) applyWompiTransaction(d wompiTxData, source string, checksum string) (bool, error) {
	changed := false
	err := h.db.Transaction(func(db *gorm.DB) error {
		var local models.WompiTransaction
		err := db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("reference = ?", d.Reference).First(&local).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("%w: unknown reference", errWompiIgnored)
		}
		if err != nil {
			return err
		}
		// Idempotencia: un pago aprobado es final; un evento repetido o tardío no lo toca.
		if local.Status == "APPROVED" {
			return fmt.Errorf("%w: already approved", errWompiIgnored)
		}

		finalized := time.Now()
		if d.FinalizedAt != nil {
			finalized = *d.FinalizedAt
		}
		upd := map[string]interface{}{
			"status": d.Status, "wompi_id": d.ID, "status_message": d.StatusMessage, "finalized_at": finalized,
		}
		if d.PaymentMethod != "" {
			upd["payment_method"] = d.PaymentMethod
		}

		switch d.Status {
		case "APPROVED":
			// El monto y la moneda deben coincidir con lo registrado al iniciar el pago.
			if d.AmountInCents != local.Amount || (d.Currency != "" && d.Currency != local.Currency) {
				return fmt.Errorf("%w: amount or currency mismatch (got %d %s, expected %d %s)",
					errWompiIgnored, d.AmountInCents, d.Currency, local.Amount, local.Currency)
			}
			if err := db.Model(&models.WompiTransaction{}).Where("reference = ?", d.Reference).Updates(upd).Error; err != nil {
				return err
			}
			if local.OrderID != nil {
				var order models.Order
				if err := db.Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, *local.OrderID).Error; err != nil {
					return err
				}
				if order.PaymentStatus == "paid" {
					return fmt.Errorf("%w: order already paid", errWompiIgnored)
				}
				order.PaymentStatus = "paid"
				order.Status = "paid"
				order.EscrowStatus = "held"
				order.WompiTransactionID = d.ID
				autoConfirm := time.Now().Add(24 * time.Hour)
				order.AutoConfirmAt = &autoConfirm
				if err := db.Save(&order).Error; err != nil {
					return err
				}
				if err := createCommissionSplitsTx(db, &order); err != nil {
					return err
				}
			}
		case "DECLINED", "VOIDED", "ERROR":
			if local.Status == d.Status && local.WompiID == d.ID {
				return fmt.Errorf("%w: no change", errWompiIgnored)
			}
			if err := db.Model(&models.WompiTransaction{}).Where("reference = ?", d.Reference).Updates(upd).Error; err != nil {
				return err
			}
			// Un rechazo tardío o repetido no deshace un pago ya aprobado de la misma orden.
			if local.OrderID != nil {
				if err := db.Model(&models.Order{}).Where("id = ? AND payment_status <> ?", *local.OrderID, "paid").
					Updates(map[string]interface{}{"payment_status": "failed", "status": "payment_failed"}).Error; err != nil {
					return err
				}
			}
		default: // PENDING u otro estado no final: nada que aplicar
			return fmt.Errorf("%w: non-final status %q", errWompiIgnored, d.Status)
		}

		ev := models.WompiEvent{Reference: d.Reference, WompiTxID: d.ID, Status: d.Status, Source: source}
		if checksum != "" {
			ev.Checksum = &checksum
		}
		if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&ev).Error; err != nil {
			return err
		}
		changed = true
		return nil
	})
	return changed, err
}

// wompiEventSeen indica si ese checksum de webhook ya se procesó (replay/reintento de Wompi).
func (h *Handler) wompiEventSeen(checksum string) bool {
	if checksum == "" {
		return false
	}
	var n int64
	h.db.Model(&models.WompiEvent{}).Where("checksum = ?", checksum).Count(&n)
	return n > 0
}

// reconcileWompiReference consulta a Wompi el estado de una referencia y lo aplica. Devuelve si cambió algo.
func (h *Handler) reconcileWompiReference(c *wompiClient, reference, source string) (bool, error) {
	d, err := c.transactionByReference(reference)
	if err != nil {
		return false, err
	}
	if d == nil {
		return false, nil // aún no se pagó
	}
	changed, err := h.applyWompiTransaction(*d, source, "")
	if errors.Is(err, errWompiIgnored) {
		return false, nil
	}
	return changed, err
}

// ─── Conciliador en segundo plano ─────────────────────────────────────────────

// StartWompiReconciler revisa cada WOMPI_RECONCILE_SECONDS (120 por defecto) los pagos PENDING de las últimas 48 h
// contra Wompi. Solo corre si hay llave privada; WOMPI_RECONCILE=false lo desactiva.
func (h *Handler) StartWompiReconciler() {
	c := newWompiClient()
	if c == nil {
		log.Printf("wompi: conciliador desactivado (sin WOMPI_PRIVATE_KEY)")
		return
	}
	if strings.EqualFold(os.Getenv("WOMPI_RECONCILE"), "false") {
		log.Printf("wompi: conciliador desactivado por WOMPI_RECONCILE=false")
		return
	}
	interval := 120 * time.Second
	if v := os.Getenv("WOMPI_RECONCILE_SECONDS"); v != "" {
		if d, err := time.ParseDuration(v + "s"); err == nil && d >= 5*time.Second {
			interval = d
		}
	}
	log.Printf("wompi: conciliador activo (cada %s, base %s)", interval, c.base)
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for range t.C {
			h.reconcilePendingWompi(c)
		}
	}()
}

func (h *Handler) reconcilePendingWompi(c *wompiClient) {
	var pending []models.WompiTransaction
	now := time.Now()
	if err := h.db.Where("status = ? AND reference LIKE ? AND created_at > ? AND created_at < ?",
		"PENDING", "MANO-%", now.Add(-48*time.Hour), now.Add(-30*time.Second)).
		Order("created_at ASC").Limit(50).Find(&pending).Error; err != nil {
		log.Printf("wompi: conciliador no pudo leer pendientes: %v", err)
		return
	}
	for _, p := range pending {
		changed, err := h.reconcileWompiReference(c, p.Reference, "reconcile")
		switch {
		case err != nil:
			log.Printf("wompi: conciliación de %s falló: %v", p.Reference, err)
		case changed:
			var orderID uint
			if p.OrderID != nil {
				orderID = *p.OrderID
			}
			log.Printf("wompi: conciliación actualizó %s (orden %d)", p.Reference, orderID)
		}
		time.Sleep(250 * time.Millisecond) // no saturar la API de Wompi
	}
}
