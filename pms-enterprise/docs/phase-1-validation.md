# Fase 1 - Validacion de alcance MVP

## Cubierto

- Configuracion base de propiedad, tipos de habitacion, habitaciones y tarifas.
- Busqueda de disponibilidad por propiedad, fechas y tipo de habitacion.
- Creacion de reservas confirmadas.
- Modificacion de reservas confirmadas antes del check-in.
- Cancelacion de reservas con liberacion de inventario.
- Control de inventario y overbooking configurado para Marina Villa.
- Check-in con asignacion automatica de habitacion limpia.
- Check-out bloqueado si el folio tiene saldo abierto.
- Folio append-only con room charge, impuestos, cargos manuales y pagos simulados.
- Audit trail basico para reservas, folios, transacciones y estadias.
- API REST con contrato OpenAPI en `/api/openapi.json`.
- Persistencia PostgreSQL opcional por `DATABASE_URL`.
- Tests automatizados del flujo critico.

## Simplificaciones aceptadas para MVP

- No hay autenticacion/RBAC real todavia; queda para endurecimiento previo a uso operativo.
- La persistencia PostgreSQL guarda estado en `jsonb` como transicion; el modelo relacional enterprise esta definido en `docs/schema.sql`.
- No hay facturacion electronica, channel manager real, night audit ni housekeeping; corresponden a fases posteriores.
- El frontend es operativo para demo, pero no reemplaza todavia un tape chart completo de recepcion.

## Endpoints clave

- `GET /api/health`
- `GET /api/openapi.json`
- `GET /api/config?propertyId=...`
- `GET /api/availability?...`
- `GET /api/reservations?propertyId=...`
- `POST /api/reservations`
- `PATCH /api/reservations/{reservationId}`
- `POST /api/reservations/{reservationId}/cancel`
- `POST /api/reservations/{reservationId}/check-in`
- `POST /api/folios/{folioId}/transactions`
- `POST /api/stays/{stayId}/check-out`
- `GET /api/audit-events?propertyId=...`
