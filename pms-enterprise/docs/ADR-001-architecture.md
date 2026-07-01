# ADR-001: Arquitectura PMS enterprise modular

## Estado

Aceptado para Fase 1 MVP.

## Contexto

El PMS debe operar multiples propiedades, con inventario, reservas, front desk, folios, auditoria, POS, reportería y contabilidad consolidada. Los modulos financieros y de disponibilidad requieren consistencia fuerte, auditabilidad y reglas centralizadas en backend.

## Decision

La arquitectura objetivo es:

- Backend: NestJS, modular monolith por bounded contexts.
- Base transaccional: PostgreSQL.
- ORM/migraciones: Prisma en desarrollo inicial, con SQL revisable para constraints criticos.
- Frontend: React, orientado a front desk y uso intensivo de teclado.
- Auth: OAuth2/JWT con RBAC por holding, propiedad, modulo y accion.
- API: REST documentada con OpenAPI.
- Infraestructura: Docker Compose para desarrollo y contenedores para despliegue.
- Analitica: replica/ETL hacia Redshift y consumo por Power BI via API/ODBC.

Para esta primera entrega ejecutable dentro del workspace se implementa un MVP sin dependencias externas usando Node.js nativo. Esto permite correr tests sin descargar paquetes. La estructura de carpetas replica los bounded contexts esperados para migrar a NestJS sin reescribir reglas de negocio.

## Bounded contexts

- Property Configuration
- Inventory and Rate Management
- Reservations
- Front Desk
- Billing/Folio
- Audit Trail
- Night Audit
- Housekeeping
- Guest CRM
- POS Integration
- Accounting Mapping
- Reporting/BI

## Reglas no negociables

- El frontend no calcula tarifas, impuestos, comisiones ni saldos.
- El folio usa transacciones append-only.
- Los pagos de tarjeta deben usar token externo; nunca PAN/CVV.
- La disponibilidad se modifica dentro de una unidad transaccional.
- Cada operacion sensible emite audit event.
- Integraciones externas entran por adapters, no por logica incrustada.

## Trade-offs

- El MVP usa almacenamiento en memoria para validar flujos; PostgreSQL queda modelado en `schema.sql`.
- No hay channel manager real en Fase 1; se reservara un adapter mock en Fase 3.
- Facturacion electronica de Costa Rica se modelara como adapter de Billing en una fase posterior.
- No se implementa ERP interno; se exportaran asientos y trial balance hacia ERP externo.
