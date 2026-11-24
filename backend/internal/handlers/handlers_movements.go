package handlers

// handlers_movements.go — Historial de movimientos del comisionista (pantalla Comisiones → "Movimientos").

import (
	"net/http"
	"sort"
	"time"

	"mano-app/backend/internal/models"

	"github.com/gin-gonic/gin"
)

type movement struct {
	Type      string    `json:"type"`   // commission | withdrawal
	Title     string    `json:"title"`  // texto para mostrar
	Amount    float64   `json:"amount"` // positivo = ingreso, negativo = egreso (COP)
	Status    string    `json:"status"` // released | pending | processing | completed | failed
	OrderID   *uint     `json:"order_id,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// MyMovements — GET /sell/movements
// Comisiones ya liberadas (+) y solicitudes de retiro (−), de la más reciente a la más antigua (máx. 100).
func (h *Handler) MyMovements(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil || claims.Role != "freelancer" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only freelancers can view their movements"})
		return
	}

	var splits []models.CommissionSplit
	h.db.Where("recipient_type = ? AND recipient_id = ? AND status = ? AND released_at IS NOT NULL",
		"freelancer", claims.UserID, "released").
		Order("released_at DESC").Limit(100).Find(&splits)

	var withdrawals []models.WithdrawalRequest
	h.db.Where("freelancer_id = ?", claims.UserID).Order("created_at DESC").Limit(100).Find(&withdrawals)

	out := make([]movement, 0, len(splits)+len(withdrawals))
	for _, s := range splits {
		orderID := s.OrderID
		out = append(out, movement{
			Type: "commission", Title: "Comisión por venta", Amount: s.Amount,
			Status: s.Status, OrderID: &orderID, CreatedAt: *s.ReleasedAt,
		})
	}
	for _, w := range withdrawals {
		out = append(out, movement{
			Type: "withdrawal", Title: "Retiro a tu cuenta", Amount: -w.Amount,
			Status: w.Status, CreatedAt: w.CreatedAt,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if len(out) > 100 {
		out = out[:100]
	}

	c.JSON(http.StatusOK, gin.H{"movements": out})
}
