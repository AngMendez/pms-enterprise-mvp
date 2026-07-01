import { id } from "../../lib/ids.js";

export function createFrontDeskService(repo, billing, audit) {
  function availableRoomFor(reservation) {
    return repo.find("rooms", (room) =>
      room.propertyId === reservation.propertyId &&
      room.roomTypeId === reservation.roomTypeId &&
      room.status === "vacant_clean" &&
      !repo.find("roomAssignments", (assignment) => assignment.roomId === room.id && assignment.isCurrent)
    );
  }

  function checkIn(reservationId, requestedRoomId = null) {
    const reservation = repo.find("reservations", (item) => item.id === reservationId);
    if (!reservation || reservation.status !== "confirmed") {
      const error = new Error("Reservation must be confirmed for check-in.");
      error.status = 409;
      throw error;
    }
    const room = requestedRoomId
      ? repo.find("rooms", (item) => item.id === requestedRoomId && item.status === "vacant_clean")
      : availableRoomFor(reservation);
    if (!room) {
      const error = new Error("No clean room available for assignment.");
      error.status = 409;
      throw error;
    }

    const stay = repo.insert("stays", {
      id: id("stay"),
      reservationId: reservation.id,
      propertyId: reservation.propertyId,
      status: "in_house",
      checkedInAt: new Date().toISOString(),
      checkedOutAt: null
    });
    const assignment = repo.insert("roomAssignments", {
      id: id("assign"),
      stayId: stay.id,
      roomId: room.id,
      assignedFrom: reservation.arrivalDate,
      assignedTo: reservation.departureDate,
      isCurrent: true
    });
    repo.update("rooms", room.id, { status: "occupied_clean", version: room.version + 1 });
    repo.update("reservations", reservation.id, { status: "checked_in", version: reservation.version + 1 });
    const folio = billing.openFolio({ propertyId: reservation.propertyId, stayId: stay.id, currency: "USD" });

    const nights = repo.list("reservationNights").filter((item) => item.reservationId === reservation.id);
    for (const night of nights) {
      billing.postTransaction({
        folioId: folio.id,
        transactionType: "charge",
        description: `Room charge ${night.stayDate}`,
        amount: night.amount,
        sourceModule: "reservations",
        sourceReference: reservation.id
      });
      if (night.taxAmount) {
        billing.postTransaction({
          folioId: folio.id,
          transactionType: "tax",
          description: `Room tax ${night.stayDate}`,
          amount: night.taxAmount,
          sourceModule: "reservations",
          sourceReference: reservation.id
        });
      }
    }

    audit.record({ propertyId: reservation.propertyId, entityType: "stay", entityId: stay.id, action: "stay.checked_in", after: { stay, assignment } });
    return { stay, assignment, folio: billing.getFolio(folio.id) };
  }

  function checkOut(stayId) {
    const stay = repo.find("stays", (item) => item.id === stayId);
    if (!stay || stay.status !== "in_house") {
      const error = new Error("Stay must be in house for checkout.");
      error.status = 409;
      throw error;
    }
    const folio = repo.find("folios", (item) => item.stayId === stay.id && item.status === "open");
    billing.closeFolio(folio.id);
    const assignment = repo.find("roomAssignments", (item) => item.stayId === stay.id && item.isCurrent);
    if (assignment) {
      assignment.isCurrent = false;
      const room = repo.find("rooms", (item) => item.id === assignment.roomId);
      repo.update("rooms", room.id, { status: "vacant_dirty", version: room.version + 1 });
    }
    repo.update("stays", stay.id, { status: "checked_out", checkedOutAt: new Date().toISOString() });
    const reservation = repo.find("reservations", (item) => item.id === stay.reservationId);
    repo.update("reservations", reservation.id, { status: "checked_out", version: reservation.version + 1 });
    audit.record({ propertyId: stay.propertyId, entityType: "stay", entityId: stay.id, action: "stay.checked_out", after: stay });
    return repo.find("stays", (item) => item.id === stayId);
  }

  return { checkIn, checkOut };
}
