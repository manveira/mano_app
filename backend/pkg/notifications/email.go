package notifications

import (
	"fmt"
	"net/smtp"
	"os"
)

// SendOrderNotification envía un email al negocio cuando llega una nueva orden.
// Usa SMTP estándar. Configurar con variables de entorno:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL
// Si no están configuradas, no hace nada (no rompe el flujo).
func SendOrderNotification(toEmail, businessName string, orderID uint, total float64) {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		return // no configurado, silencioso
	}

	port := os.Getenv("SMTP_PORT")
	if port == "" {
		port = "587"
	}
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	from := os.Getenv("FROM_EMAIL")
	if from == "" {
		from = user
	}

	subject := fmt.Sprintf("Nueva orden #%d en %s", orderID, businessName)
	body := fmt.Sprintf(`Hola %s,

Tienes una nueva orden en Mano App.

Orden #%d
Total: $%.0f COP

Entra a la app para ver los detalles y despachar el pedido.

— Equipo Mano`, businessName, orderID, total)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s", from, toEmail, subject, body)

	auth := smtp.PlainAuth("", user, pass, host)
	// Envío asíncrono — no bloquea el flujo de la orden
	go func() {
		smtp.SendMail(host+":"+port, auth, from, []string{toEmail}, []byte(msg))
	}()
}
