import { assertDateRange, eachStayDate } from "../../lib/dates.js";

export function createInventoryService(repo) {
  function getAvailability({ propertyId, roomTypeId, arrivalDate, departureDate }) {
    assertDateRange(arrivalDate, departureDate);
    return eachStayDate(arrivalDate, departureDate).map((stayDate) => {
      const day = repo.find(
        "inventoryDays",
        (item) => item.propertyId === propertyId && item.roomTypeId === roomTypeId && item.stayDate === stayDate
      );
      if (!day) {
        const error = new Error(`Inventory is not configured for ${stayDate}.`);
        error.status = 409;
        throw error;
      }
      const sellable = day.physicalCount - day.outOfOrderCount + day.overbookingLimit;
      return {
        stayDate,
        physicalCount: day.physicalCount,
        reservedCount: day.reservedCount,
        availableCount: sellable - day.reservedCount,
        overbookingLimit: day.overbookingLimit
      };
    });
  }

  function assertAvailable(query) {
    const nights = getAvailability(query);
    const blocked = nights.find((night) => night.availableCount <= 0);
    if (blocked) {
      const error = new Error(`No availability for ${blocked.stayDate}.`);
      error.status = 409;
      throw error;
    }
    return nights;
  }

  function reserve(query) {
    assertAvailable(query);
    for (const stayDate of eachStayDate(query.arrivalDate, query.departureDate)) {
      const day = repo.find(
        "inventoryDays",
        (item) => item.propertyId === query.propertyId && item.roomTypeId === query.roomTypeId && item.stayDate === stayDate
      );
      day.reservedCount += 1;
      day.version += 1;
    }
  }

  function release(query) {
    for (const stayDate of eachStayDate(query.arrivalDate, query.departureDate)) {
      const day = repo.find(
        "inventoryDays",
        (item) => item.propertyId === query.propertyId && item.roomTypeId === query.roomTypeId && item.stayDate === stayDate
      );
      if (day) {
        day.reservedCount = Math.max(0, day.reservedCount - 1);
        day.version += 1;
      }
    }
  }

  return { getAvailability, assertAvailable, reserve, release };
}
