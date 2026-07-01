import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { createApp } from "../src/app.js";

describe("PMS MVP critical flow", () => {
  it("creates a reservation, checks in, posts folio charges, pays and checks out", () => {
    const app = createApp();
    const { inventory, reservations, frontDesk, billing } = app.services;

    const before = inventory.getAvailability({
      propertyId: "prop_playa",
      roomTypeId: "rt_playa_std",
      arrivalDate: "2026-07-02",
      departureDate: "2026-07-04"
    });

    const reservation = reservations.createReservation({
      propertyId: "prop_playa",
      roomTypeId: "rt_playa_std",
      ratePlanId: "rp_playa_bar",
      arrivalDate: "2026-07-02",
      departureDate: "2026-07-04",
      guestName: "Ana Morales",
      guestEmail: "ana@example.com",
      source: "direct"
    });

    assert.equal(reservation.status, "confirmed");
    assert.equal(reservation.nights.length, 2);
    assert.equal(reservation.total, 406.8);

    const afterReservation = inventory.getAvailability({
      propertyId: "prop_playa",
      roomTypeId: "rt_playa_std",
      arrivalDate: "2026-07-02",
      departureDate: "2026-07-04"
    });
    assert.equal(afterReservation[0].availableCount, before[0].availableCount - 1);

    const checkIn = frontDesk.checkIn(reservation.id);
    assert.equal(checkIn.stay.status, "in_house");
    assert.equal(checkIn.folio.balance, 406.8);
    assert.equal(checkIn.folio.transactions.length, 4);

    billing.postTransaction({
      folioId: checkIn.folio.id,
      transactionType: "charge",
      description: "Manual minibar charge",
      amount: 25,
      sourceModule: "front_desk"
    });
    assert.equal(billing.getFolio(checkIn.folio.id).balance, 431.8);

    billing.postTransaction({
      folioId: checkIn.folio.id,
      transactionType: "payment",
      description: "Tokenized card payment",
      amount: -431.8,
      sourceModule: "front_desk"
    });

    const paidFolio = billing.getFolio(checkIn.folio.id);
    assert.equal(paidFolio.balance, 0);

    const checkedOut = frontDesk.checkOut(checkIn.stay.id);
    assert.equal(checkedOut.status, "checked_out");

    const closedFolio = billing.getFolio(checkIn.folio.id);
    assert.equal(closedFolio.status, "closed");
    assert.equal(app.repo.list("auditEvents").length >= 5, true);
  });

  it("prevents selling more rooms than configured inventory", () => {
    const app = createApp();
    const { reservations } = app.services;

    reservations.createReservation({
      propertyId: "prop_playa",
      roomTypeId: "rt_playa_suite",
      ratePlanId: "rp_playa_bar",
      arrivalDate: "2026-07-03",
      departureDate: "2026-07-04",
      guestName: "Suite One"
    });

    assert.throws(() => {
      reservations.createReservation({
        propertyId: "prop_playa",
        roomTypeId: "rt_playa_suite",
        ratePlanId: "rp_playa_bar",
        arrivalDate: "2026-07-03",
        departureDate: "2026-07-04",
        guestName: "Suite Two"
      });
    }, /No availability/);
  });

  it("modifies and cancels confirmed reservations before check-in", () => {
    const app = createApp();
    const { inventory, reservations, audit } = app.services;

    const reservation = reservations.createReservation({
      propertyId: "prop_playa",
      roomTypeId: "rt_playa_std",
      ratePlanId: "rp_playa_bar",
      arrivalDate: "2026-07-06",
      departureDate: "2026-07-08",
      guestName: "Modify Guest"
    });

    const modified = reservations.updateReservation(reservation.id, {
      arrivalDate: "2026-07-07",
      departureDate: "2026-07-09",
      guestName: "Modified Guest"
    });

    assert.equal(modified.guestName, "Modified Guest");
    assert.equal(modified.arrivalDate, "2026-07-07");
    assert.equal(modified.nights.length, 2);

    const cancelled = reservations.cancelReservation(reservation.id);
    assert.equal(cancelled.status, "cancelled");

    const released = inventory.getAvailability({
      propertyId: "prop_playa",
      roomTypeId: "rt_playa_std",
      arrivalDate: "2026-07-07",
      departureDate: "2026-07-09"
    });
    assert.equal(released[0].reservedCount, 0);
    assert.equal(audit.list("prop_playa").some((event) => event.action === "reservation.cancelled"), true);
  });

  it("allows controlled overbooking for Marina Villa holiday dates", () => {
    const app = createApp();
    const { reservations } = app.services;

    for (const guestName of ["Marina Holiday One", "Marina Holiday Two"]) {
      const reservation = reservations.createReservation({
        propertyId: "prop_marina",
        roomTypeId: "rt_marina_villa",
        ratePlanId: "rp_marina_bar",
        arrivalDate: "2026-12-24",
        departureDate: "2026-12-31",
        guestName
      });
      assert.equal(reservation.status, "confirmed");
    }

    assert.throws(() => {
      reservations.createReservation({
        propertyId: "prop_marina",
        roomTypeId: "rt_marina_villa",
        ratePlanId: "rp_marina_bar",
        arrivalDate: "2026-12-24",
        departureDate: "2026-12-31",
        guestName: "Marina Holiday Three"
      });
    }, /No availability/);
  });

  it("does not allow checkout with an open balance", () => {
    const app = createApp();
    const { reservations, frontDesk } = app.services;

    const reservation = reservations.createReservation({
      propertyId: "prop_marina",
      roomTypeId: "rt_marina_villa",
      ratePlanId: "rp_marina_bar",
      arrivalDate: "2026-07-05",
      departureDate: "2026-07-06",
      guestName: "Marina Guest"
    });
    const checkIn = frontDesk.checkIn(reservation.id);

    assert.throws(() => {
      frontDesk.checkOut(checkIn.stay.id);
    }, /balance must be zero/);
  });
});

describe("Frontend shell", () => {
  it("loads the browser app as an ES module so top-level await can initialize controls", async () => {
    const html = await readFile(new URL("../src/public/index.html", import.meta.url), "utf8");
    assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  });
});

describe("HTTP server", () => {
  it("imports cleanly with memory persistence fallback", async () => {
    const { server } = await import("../src/server.js");
    assert.equal(typeof server.listen, "function");
  });

  it("serves OpenAPI and health endpoints", async () => {
    const { server } = await import("../src/server.js");
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();

    const health = await fetch(`http://localhost:${port}/api/health`).then((response) => response.json());
    const openapi = await fetch(`http://localhost:${port}/api/openapi.json`).then((response) => response.json());

    assert.equal(health.status, "ok");
    assert.equal(openapi.openapi, "3.0.3");
    assert.equal(openapi.paths["/api/reservations/{reservationId}/cancel"].post.summary.includes("Cancel"), true);

    await new Promise((resolve) => server.close(resolve));
  });
});
