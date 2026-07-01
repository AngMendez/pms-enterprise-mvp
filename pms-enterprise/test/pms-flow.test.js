import assert from "node:assert/strict";
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
      transactionType: "payment",
      description: "Tokenized card payment",
      amount: -406.8,
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
