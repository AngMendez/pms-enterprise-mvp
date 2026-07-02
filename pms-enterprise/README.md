# PMS Enterprise MVP

MVP funcional para un PMS multi-propiedad, organizado por bounded context y preparado para evolucionar hacia NestJS + PostgreSQL + Prisma.

## Alcance implementado

- Configuracion base de propiedades, tipos de habitacion, habitaciones y tarifas.
- Busqueda de disponibilidad por propiedad, fechas y tipo de habitacion.
- Creacion de reservas con descuento de inventario.
- Check-in con asignacion de habitacion.
- Folio append-only con cargos y pagos.
- Check-out con validacion de balance en cero.
- Audit trail basico.
- Frontend operativo para front desk.
- Tests automatizados del flujo critico.
- Persistencia opcional en PostgreSQL mediante `DATABASE_URL`.

## Ejecutar

```bash
npm test
npm start
```

Luego abrir:

```text
http://localhost:3000
```

## Estructura

```text
docs/
  ADR-001-architecture.md
  er-diagram.md
  schema.sql
src/
  contexts/
    audit/
    billing/
    front-desk/
    inventory/
    property/
    reservations/
  public/
  server.js
test/
  pms-flow.test.js
```

## Estado de persistencia

PostgreSQL ya esta conectado mediante `DATABASE_URL`. La persistencia del MVP usa tablas relacionales `pms_*` para propiedades, inventario, reservas, estadias, folios, transacciones, auditoria y secuencias.

Si la base todavia tiene datos antiguos en `pms_app_state`, el adapter los importa automaticamente hacia las tablas relacionales en el primer arranque.

## Siguiente paso recomendado

La siguiente iteracion deberia endurecer el modelo relacional con migraciones versionadas, reemplazar el save completo por repositorios transaccionales por agregado y mover los bounded contexts a modulos NestJS/Prisma.

## Despliegue gratuito

Ver [docs/deploy-free.md](docs/deploy-free.md). La opcion recomendada para esta version es Render Free Web Service.

## Validacion Fase 1

Ver [docs/phase-1-validation.md](docs/phase-1-validation.md).

## Health check

```text
/api/health
```

Devuelve `storage: "postgres-relational"` cuando `DATABASE_URL` esta configurado; de lo contrario usa `storage: "memory"`.
