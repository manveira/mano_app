package handlers

// handlers_payments.go — "Mis pagos": historial y detalle de los pagos de Wompi mapeados a las órdenes de la app,
// y sincronización manual de una orden con Wompi (para cuando el comprador vuelve del checkout).
//
// Reglas de acceso (añadidas 25-nov-2026, aditivas al contrato):
//   · scope=mine (por defecto): pagos que hizo el usuario como comprador.
//   · scope=received: solo business_owner; pagos de órdenes de sus negocios. Sin datos personales del pagador.
//   · Cualquier otro caso devuelve 404 (no se revela si la referencia existe).
// Todas las respuestas llevan Cache-Control: no-store (datos financieros).

import (
	"errors"
	"log"
	"net/http"
	"sync"
	"time"

	"mano-app/backend/internal/models"

	"github.com/gin-gonic/gin"
)

type paymentView struct {
	Reference     string     `json:"reference"`
	WompiID       string     `json:"wompi_id,omitempty"`
	OrderID       *uint      `json:"order_id,omitempty"`
	Amount        float64    `json:"amount"`          // pesos COP
	AmountInCents int64      `json:"amount_in_cents"` // centavos, como lo maneja Wompi
	Currency      string     `json:"currency"`
	Status        string     `json:"status"` // PENDING | APPROVED | DECLINED | VOIDED | ERROR
	StatusMessage string     `json:"status_message,omitempty"`
	PaymentMethod string     `json:"payment_method,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	FinalizedAt   *time.Time `json:"finalized_at,omitempty"`
	OrderStatus   string     `json:"order_status,omitempty"`
	EscrowStatus  string     `json:"escrow_status,omitempty"`
}

// paymentRow es el resultado del JOIN pagos × órdenes.
type paymentRow struct {
	models.WompiTransaction
	OrderStatus  string
	EscrowStatus string
}

func (r paymentRow) view() paymentView {
	wid := r.WompiID
	return paymentView{
		Reference: r.Reference, WompiID: wid, OrderID: r.OrderID,
		Amount: float64(r.Amount) / 100, AmountInCents: r.Amount, Currency: r.Currency,
		Status: r.Status, StatusMessage: r.StatusMessage, PaymentMethod: r.PaymentMethod,
		CreatedAt: r.CreatedAt, FinalizedAt: r.FinalizedAt,
		OrderStatus: r.OrderStatus, EscrowStatus: r.EscrowStatus,
	}
}

// visiblePayments arma la consulta con el alcance permitido para el usuario. ok=false si el alcance no es válido.
func (h *Handler) visiblePayments(claims *tokenClaims, scope string) (query string, args []interface{}, ok bool) {
	const base = `SELECT t.*, o.status AS order_status, o.escrow_status AS escrow_status
		FROM wompi_transactions t LEFT JOIN orders o ON o.id = t.order_id WHERE `
	switch scope {
	case "", "mine":
		return base + `(t.user_id = ? OR o.customer_id = ?)`, []interface{}{claims.UserID, claims.UserID}, true
	case "received":
		if claims.Role != "business_owner" {
			return "", nil, false
		}
		return base + `o.business_id IN (SELECT id FROM businesses WHERE owner_id = ?)`, []interface{}{claims.UserID}, true
	}
	return "", nil, false
}

// ListMyPayments — GET /payments?scope=mine|received&limit=&offset=
func (h *Handler) ListMyPayments(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	scope := c.Query("scope")
	q, args, ok := h.visiblePayments(claims, scope)
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "scope not allowed for your role"})
		return
	}
	limit, offset := clampInt(c.Query("limit"), 50, 1, 100), clampInt(c.Query("offset"), 0, 0, 100000)

	var rows []paymentRow
	if err := h.db.Raw(q+` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`, append(args, limit, offset)...).Scan(&rows).Error; err != nil {
		log.Printf("payments: no se pudo listar: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch payments"})
		return
	}
	out := make([]paymentView, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.view())
	}
	c.JSON(http.StatusOK, gin.H{"payments": out, "count": len(out)})
}

// GetMyPayment — GET /payments/:reference  (detalle + línea de tiempo de cambios de estado)
func (h *Handler) GetMyPayment(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	ref := c.Param("reference")
	if !wompiIDRe.MatchString(ref) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid reference"})
		return
	}
	scope := c.Query("scope")
	q, args, ok := h.visiblePayments(claims, scope)
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "scope not allowed for your role"})
		return
	}
	var rows []paymentRow
	if err := h.db.Raw(q+` AND t.reference = ? LIMIT 1`, append(args, ref)...).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch payment"})
		return
	}
	if len(rows) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "payment not found"})
		return
	}
	var events []models.WompiEvent
	h.db.Where("reference = ?", ref).Order("created_at ASC").Find(&events)
	timeline := make([]gin.H, 0, len(events))
	for _, e := range events {
		timeline = append(timeline, gin.H{"status": e.Status, "source": e.Source, "at": e.CreatedAt})
	}
	c.JSON(http.StatusOK, gin.H{"payment": rows[0].view(), "timeline": timeline})
}

// ─── Sincronizar una orden con Wompi ──────────────────────────────────────────

// Limita las consultas a Wompi por orden (evita que un cliente use el endpoint para saturar la API de Wompi).
var wompiSyncThrottle = struct {
	sync.Mutex
	last map[uint]time.Time
}{last: map[uint]time.Time{}}

const wompiSyncMinInterval = 5 * time.Second

func allowWompiSync(orderID uint) bool {
	wompiSyncThrottle.Lock()
	defer wompiSyncThrottle.Unlock()
	now := time.Now()
	if t, ok := wompiSyncThrottle.last[orderID]; ok && now.Sub(t) < wompiSyncMinInterval {
		return false
	}
	if len(wompiSyncThrottle.last) > 5000 { // evita crecimiento sin límite
		for k, t := range wompiSyncThrottle.last {
			if now.Sub(t) > time.Minute {
				delete(wompiSyncThrottle.last, k)
			}
		}
	}
	wompiSyncThrottle.last[orderID] = now
	return true
}

type syncWompiRequest struct {
	OrderID uint `json:"order_id" binding:"required"`
}

// SyncWompiPayment — POST /payments/wompi/sync {order_id}
// Pregunta a Wompi (servidor a servidor, nunca confía en el cliente) por los pagos pendientes de la orden y aplica
// el resultado. Se llama al volver del checkout. Solo el comprador de la orden.
func (h *Handler) SyncWompiPayment(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}
	var req syncWompiRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var order models.Order
	if err := h.db.First(&order, req.OrderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	if order.CustomerID == nil || *order.CustomerID != claims.UserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your order"})
		return
	}
	client := newWompiClient()
	if client == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "payment verification not configured"})
		return
	}
	if !allowWompiSync(order.ID) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "try again in a few seconds"})
		return
	}

	var pending []models.WompiTransaction
	h.db.Where("order_id = ? AND status <> ? AND reference LIKE ?", order.ID, "APPROVED", "MANO-%").
		Order("created_at DESC").Limit(5).Find(&pending)

	updated := false
	for _, p := range pending {
		changed, err := h.reconcileWompiReference(client, p.Reference, "sync")
		if errors.Is(err, errWompiUnavailable) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "payment provider unavailable, try again later"})
			return
		}
		if err != nil {
			log.Printf("payments: sync de %s falló: %v", p.Reference, err)
			continue
		}
		updated = updated || changed
	}

	h.db.First(&order, order.ID)
	var rows []paymentRow
	q, args, _ := h.visiblePayments(claims, "mine")
	h.db.Raw(q+` AND t.order_id = ? ORDER BY t.created_at DESC`, append(args, order.ID)...).Scan(&rows)
	views := make([]paymentView, 0, len(rows))
	for _, r := range rows {
		views = append(views, r.view())
	}
	c.JSON(http.StatusOK, gin.H{
		"order_id": order.ID, "order_status": order.Status, "payment_status": order.PaymentStatus,
		"escrow_status": order.EscrowStatus, "updated": updated, "payments": views,
	})
}

// clampInt parsea un entero de query con valor por defecto y límites.
func clampInt(raw string, def, min, max int) int {
	n := def
	if raw != "" {
		v := 0
		for _, ch := range raw {
			if ch < '0' || ch > '9' || v > 1_000_000 {
				return def
			}
			v = v*10 + int(ch-'0')
		}
		n = v
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
