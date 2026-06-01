# Mano App Backend

## Descripción
Backend inicial en Go para Mano App, con rutas base para autenticación, negocios, productos, pedidos, dashboard y contenido social.

## Requisitos
- Go 1.22+
- PostgreSQL (o un contenedor Docker con PostgreSQL)

## Ejecución local con Docker

1. Desde `backend/`, arranca PostgreSQL:

```bash
docker-compose up -d
```

2. Configura las variables de entorno:
   - `SERVER_PORT` (por defecto `:8080`)
   - `DATABASE_DSN` (por defecto `postgres://user:pass@localhost:5432/mano?sslmode=disable`)
   - `JWT_SECRET`

3. Ejecuta el servidor:

```bash
go run .
```

## Ejecución sin Docker

1. Asegúrate de tener PostgreSQL corriendo localmente.
2. Crea la base de datos `mano` y usa las mismas credenciales del DSN.
3. Ejecuta el servidor:

```bash
go run .
```

## Próximos pasos
- Agregar migraciones de base de datos con GORM o una librería de migration.
- Implementar autenticación con JWT y roles.
- Desarrollar controladores de negocio, producto, order, publicidad y delivery.
- Agregar integración de pagos y mapas.

prompt 

te voy a pasar lo que quiero en la app, la logica. la idea es que el backend sea en golang. El otro stack si sugierelo tù. Eres un experto recuerda:

Idea principal: Yo por ayudarte a vender tu producto me estoy ganando una comision, a ti te estan entrando ventas. Todo el mundo por la app va a ganar plata

Dos formas registrarse, cliente dueño de negocio y usuario freelance que es quien va a ayudar a vender.

Dueño de negocio puede crear su tienda en linea, donde pueda subir sus productos, lo que esta vendiendo y una seccion donde el mire sus graficas, datos, estadisticas sobre las ventas, cuantas le estan entrando, cuanto dinero ha ganado, que tenga su control.

Tambien para el dueño de negocio, beneficios de la exposicion de su negocio por medio de pagar publicidad, trafico de clientes, entonces importante un tipo de scrolling para generar adiccion a los users y clientes de la app. Que la gente pueda publicar sus historias, estilo rappi pero entre hibrida como si fuera una red social

Por parte del usuario, yo como user/freelancer pueda decir listo voy a volverme el mejor vendedor de x negocio o cliente. ganar comisiones por separar ventas, por promocionar productos, por domicilios, facilidades para hacer dinero por medio de la app.

Y ahora hablemos de mi como dueño de la app, que ganamos? 
Ganar un minimo porcentaje de las ventas que se hagan, por medio de la publicidad que el cliente pueda pagar publicidad por unos paquetes que arme la app para que ellos la paguen, paquete premium, paquete basico

Ahora tambien una seccion de domicilios o deliverys dentro de la app, seria como otro nicho o servicio dentro de la app. Por medio de la app, si yo pedi algo de que se pueda visualizar por ejemplo que en x tiempo llega mi pedido, que la gente lleve ese control

Tambien pensando en el turista que llegue pueda descargar la applicacion y encuentre el servicio de mapa local del pueblo o ciudad, estilo google map o waze pero no para vehiculos, sino para los users. Que por ejemplo los clientes o restaurantes que nos pagan publicidad, lo primero que le aparezca al turista es listo, tiene hambre, vaya a comer en esta sugerencia de restaurante aliado, tienda de tal cosa, hotel de tal cosa, corresponsales, etc.

Por ejemplo en los hoteles. El otro día una compañera de la U de otra ciudad, vinieron a pasear 20 personas al lugar local, yo les busque el hotel sin el hotel pagarme publicidad, yo no me gane nada pero el hotel en esas 20 personas tuvo que hacerse mucho dinero.

Finalmente, todo el tema del dinero. Como vamos a vincular las cuentas, pasarelas de pagos, vinculaciones con bancos, etc