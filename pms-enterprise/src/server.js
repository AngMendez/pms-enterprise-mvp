import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeApp } from "./app.js";

const app = await createRuntimeApp();
const publicDir = join(fileURLToPath(new URL(".", import.meta.url)), "public");

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function sendStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = join(publicDir, path);
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  };
  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "content-type": contentTypes[extname(filePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  const { property, inventory, reservations, frontDesk, billing } = app.services;

  try {
    if (!url.pathname.startsWith("/api")) {
      await sendStatic(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        status: "ok",
        storage: app.persistence.enabled ? "postgres" : "memory"
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/properties") {
      sendJson(res, 200, property.listProperties());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      const propertyId = url.searchParams.get("propertyId") || "prop_playa";
      sendJson(res, 200, {
        property: property.getProperty(propertyId),
        roomTypes: property.listRoomTypes(propertyId),
        rooms: property.listRooms(propertyId),
        ratePlans: property.listRatePlans(propertyId)
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/availability") {
      sendJson(res, 200, inventory.getAvailability({
        propertyId: url.searchParams.get("propertyId"),
        roomTypeId: url.searchParams.get("roomTypeId"),
        arrivalDate: url.searchParams.get("arrivalDate"),
        departureDate: url.searchParams.get("departureDate")
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/reservations") {
      sendJson(res, 200, reservations.listReservations(url.searchParams.get("propertyId")));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/reservations") {
      const payload = reservations.createReservation(await parseBody(req));
      await app.persistence.save();
      sendJson(res, 201, payload);
      return;
    }

    if (req.method === "POST" && url.pathname.endsWith("/check-in")) {
      const reservationId = url.pathname.split("/")[3];
      const body = await parseBody(req);
      const payload = frontDesk.checkIn(reservationId, body.roomId);
      await app.persistence.save();
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === "POST" && url.pathname.endsWith("/check-out")) {
      const stayId = url.pathname.split("/")[3];
      const payload = frontDesk.checkOut(stayId);
      await app.persistence.save();
      sendJson(res, 200, payload);
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/folios/")) {
      const folioId = url.pathname.split("/")[3];
      sendJson(res, 200, billing.getFolio(folioId));
      return;
    }

    if (req.method === "POST" && url.pathname.endsWith("/transactions")) {
      const folioId = url.pathname.split("/")[3];
      const payload = billing.postTransaction({ folioId, ...(await parseBody(req)) });
      await app.persistence.save();
      sendJson(res, 201, payload);
      return;
    }

    sendJson(res, 404, { error: "Route not found" });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message });
  }
}

const server = createServer(route);
const port = process.env.PORT || 3000;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, () => {
    console.log(`PMS MVP listening on http://localhost:${port}`);
  });
}

export { server };
