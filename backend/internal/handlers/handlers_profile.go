package handlers

// handlers_profile.go — Edición del perfil propio (pantalla Ajustes).

import (
	"net/http"
	"regexp"
	"strings"

	"mano-app/backend/internal/models"

	"github.com/gin-gonic/gin"
)

var (
	digitsRe = regexp.MustCompile(`^[0-9]+$`)
)

// updateMeRequest: todos los campos son opcionales; solo se cambian los que vienen en el JSON.
// Un valor "" en phone/nequi_number/document_id los borra.
type updateMeRequest struct {
	Name        *string `json:"name"`
	Phone       *string `json:"phone"`
	NequiNumber *string `json:"nequi_number"`
	DocumentID  *string `json:"document_id"`
}

// normalizeDigits quita espacios y guiones; devuelve "" si no queda nada.
func normalizeDigits(v string) string {
	v = strings.NewReplacer(" ", "", "-", "", ".", "").Replace(strings.TrimSpace(v))
	return v
}

// UpdateMe — PATCH /me
func (h *Handler) UpdateMe(c *gin.Context) {
	claims := h.getClaims(c)
	if claims == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req updateMeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if len([]rune(name)) < 2 || len([]rune(name)) > 80 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name must have between 2 and 80 characters"})
			return
		}
		updates["name"] = name
	}

	if req.Phone != nil {
		phone := normalizeDigits(*req.Phone)
		if phone != "" {
			if !digitsRe.MatchString(phone) || len(phone) < 7 || len(phone) > 15 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid phone"})
				return
			}
			var taken int64
			h.db.Model(&models.User{}).Where("phone = ? AND id <> ?", phone, claims.UserID).Count(&taken)
			if taken > 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "phone number already registered"})
				return
			}
		}
		updates["phone"] = phone
	}

	if req.NequiNumber != nil {
		nequi := normalizeDigits(*req.NequiNumber)
		if nequi != "" && (!digitsRe.MatchString(nequi) || len(nequi) != 10) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid nequi_number (10 digits)"})
			return
		}
		updates["nequi_number"] = nequi
	}

	if req.DocumentID != nil {
		doc := normalizeDigits(*req.DocumentID)
		if doc != "" && (!digitsRe.MatchString(doc) || len(doc) < 5 || len(doc) > 15) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document_id"})
			return
		}
		updates["document_id"] = doc
	}

	if len(updates) > 0 {
		if err := h.db.Model(&models.User{}).Where("id = ?", claims.UserID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "could not update profile"})
			return
		}
	}

	var user models.User
	h.db.Select("id, name, email, role, username, phone, document_id, nequi_number, referral_code, plan, plan_expires_at, earnings_balance, is_verified").
		First(&user, claims.UserID)
	c.JSON(http.StatusOK, gin.H{"user": user})
}
