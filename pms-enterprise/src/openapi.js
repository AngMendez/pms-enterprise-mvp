export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "PMS Enterprise MVP API",
    version: "0.1.0"
  },
  paths: {
    "/api/health": {
      get: {
        summary: "Runtime health and storage mode",
        responses: { 200: { description: "Health payload" } }
      }
    },
    "/api/properties": {
      get: {
        summary: "List properties",
        responses: { 200: { description: "Properties" } }
      }
    },
    "/api/config": {
      get: {
        summary: "Property configuration",
        parameters: [{ name: "propertyId", in: "query", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Room types, rooms and rate plans" } }
      }
    },
    "/api/availability": {
      get: {
        summary: "Search availability",
        parameters: [
          { name: "propertyId", in: "query", required: true, schema: { type: "string" } },
          { name: "roomTypeId", in: "query", required: true, schema: { type: "string" } },
          { name: "arrivalDate", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "departureDate", in: "query", required: true, schema: { type: "string", format: "date" } }
        ],
        responses: { 200: { description: "Nightly availability" }, 409: { description: "Inventory not configured" } }
      }
    },
    "/api/reservations": {
      get: {
        summary: "List reservations",
        parameters: [{ name: "propertyId", in: "query", required: false, schema: { type: "string" } }],
        responses: { 200: { description: "Reservations" } }
      },
      post: {
        summary: "Create reservation",
        requestBody: { required: true, content: { "application/json": { example: {
          propertyId: "prop_playa",
          roomTypeId: "rt_playa_std",
          ratePlanId: "rp_playa_bar",
          arrivalDate: "2026-07-02",
          departureDate: "2026-07-04",
          guestName: "Ana Morales",
          guestEmail: "ana@example.com"
        } } } },
        responses: { 201: { description: "Reservation created" }, 409: { description: "No availability" } }
      }
    },
    "/api/reservations/{reservationId}": {
      get: {
        summary: "Get reservation",
        parameters: [{ name: "reservationId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Reservation" }, 404: { description: "Not found" } }
      },
      patch: {
        summary: "Modify confirmed reservation before check-in",
        parameters: [{ name: "reservationId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { example: {
          arrivalDate: "2026-07-03",
          departureDate: "2026-07-05",
          guestName: "Ana Morales"
        } } } },
        responses: { 200: { description: "Reservation modified" }, 409: { description: "Cannot modify" } }
      }
    },
    "/api/reservations/{reservationId}/cancel": {
      post: {
        summary: "Cancel reservation and release inventory",
        parameters: [{ name: "reservationId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Reservation cancelled" }, 409: { description: "Cannot cancel" } }
      }
    },
    "/api/reservations/{reservationId}/check-in": {
      post: {
        summary: "Check in reservation and open folio",
        parameters: [{ name: "reservationId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Stay, room assignment and folio" } }
      }
    },
    "/api/stays/{stayId}/check-out": {
      post: {
        summary: "Check out stay after folio balance reaches zero",
        parameters: [{ name: "stayId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Stay checked out" }, 409: { description: "Open balance" } }
      }
    },
    "/api/folios/{folioId}": {
      get: {
        summary: "Get folio with append-only transactions and balance",
        parameters: [{ name: "folioId", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Folio" } }
      }
    },
    "/api/folios/{folioId}/transactions": {
      post: {
        summary: "Post manual charge, tax, payment or adjustment",
        parameters: [{ name: "folioId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { example: {
          transactionType: "charge",
          description: "Minibar",
          amount: 24.5,
          sourceModule: "front_desk"
        } } } },
        responses: { 201: { description: "Transaction posted" } }
      }
    },
    "/api/audit-events": {
      get: {
        summary: "List audit events",
        parameters: [{ name: "propertyId", in: "query", required: false, schema: { type: "string" } }],
        responses: { 200: { description: "Audit events" } }
      }
    }
  }
};
