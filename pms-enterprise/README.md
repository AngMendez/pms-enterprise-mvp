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

## Siguiente paso recomendado

La siguiente iteracion deberia reemplazar el repositorio en memoria por PostgreSQL, mover los bounded contexts a modulos NestJS y aplicar el SQL versionado como migracion inicial.

## Despliegue gratuito

Ver [docs/deploy-free.md](docs/deploy-free.md). La opcion recomendada para esta version es Render Free Web Service.
