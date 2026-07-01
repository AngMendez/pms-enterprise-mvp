import { assertDateRange, eachStayDate } from "../../lib/dates.js";
import { confirmationNumber, id } from "../../lib/ids.js";

export function createReservationsService(repo, inventory, audit) {
  function quoteNights({ propertyId, roomTypeId, ratePlanId, arrivalDate, departureDate }) {
    assertDateRange(arrivalDate, departureDate);
    return eachStayDate(arrivalDate, departureDate).map((stayDate) => {
      const rule = repo.find("rateRules", (item) =>
        item.ratePlanId === ratePlanId &&
        item.roomTypeId === roomTypeId &&
        item.validFrom <= stayDate &&
        item.validTo >= stayDate &&
        !item.stopSell
      );
      if (!rule) {
        const error = new Error(`No rate configured for ${stayDate}.`);
        error.status = 409;
        throw error;
      }
      const ratePlan = repo.find("ratePlans", (item) => item.id === ratePlanId && item.propertyId === propertyId);
      return {
        stayDate,
        amount: rule.amount,
        taxAmount: Number((rule.amount * rule.taxRate).toFixed(2)),
        currency: ratePlan.currency
      };
    });
  }

  function createReservation(payload) {
    const property = repo.find("properties", (item) => item.id === payload.propertyId);
    if (!property) {
      const error = new Error("Property not found.");
      error.status = 404;
      throw error;
    }
    inventory.reserve(payload);
    const nights = quoteNights(payload);
    const reservation = repo.insert("reservations", {
      id: id("res"),
      propertyId: payload.propertyId,
      confirmationNumber: confirmationNumber(repo.next("reservation")),
      status: "confirmed",
      arrivalDate: payload.arrivalDate,
      departureDate: payload.departureDate,
      roomTypeId: payload.roomTypeId,
      ratePlanId: payload.ratePlanId,
      source: payload.source || "direct",
      adults: payload.adults || 1,
      children: payload.children || 0,
      guestName: payload.guestName,
      guestEmail: payload.guestEmail || null,
      guaranteeType: payload.guaranteeType || "card_token",
      createdAt: new Date().toISOString(),
      version: 1
    });
    for (const night of nights) {
      repo.insert("reservationNights", { id: id("night"), reservationId: reservation.id, ...night });
    }
    audit.record({ propertyId: reservation.propertyId, entityType: "reservation", entityId: reservation.id, action: "reservation.created", after: reservation });
    return getReservation(reservation.id);
  }

  function getReservation(id) {
    const reservation = repo.find("reservations", (item) => item.id === id);
    if (!reservation) {
      const error = new Error("Reservation not found.");
      error.status = 404;
      throw error;
    }
    const nights = repo.list("reservationNights").filter((item) => item.reservationId === id);
    const total = nights.reduce((sum, night) => sum + night.amount + night.taxAmount, 0);
    return { ...reservation, nights, total: Number(total.toFixed(2)) };
  }

  function listReservations(propertyId) {
    return repo.list("reservations")
      .filter((item) => !propertyId || item.propertyId === propertyId)
      .map((item) => getReservation(item.id));
  }

  return { createReservation, getReservation, listReservations, quoteNights };
}
