import { eachStayDate } from "../lib/dates.js";

export function createSeedData() {
  const holding = {
    id: "holding_enjoy",
    name: "Enjoy Hospitality Group",
    baseCurrency: "USD"
  };

  const properties = [
    {
      id: "prop_playa",
      holdingId: holding.id,
      code: "PLAYA",
      name: "Hotel Playa Dorada",
      propertyType: "hotel",
      timezone: "America/Costa_Rica",
      defaultCurrency: "USD",
      businessDate: "2026-07-01"
    },
    {
      id: "prop_marina",
      holdingId: holding.id,
      code: "MARINA",
      name: "Marina Azul Resort",
      propertyType: "mixed",
      timezone: "America/Costa_Rica",
      defaultCurrency: "USD",
      businessDate: "2026-07-01"
    }
  ];

  const roomTypes = [
    { id: "rt_playa_std", propertyId: "prop_playa", code: "STD", name: "Standard King", maxOccupancy: 2, baseAdults: 2 },
    { id: "rt_playa_suite", propertyId: "prop_playa", code: "STE", name: "Ocean Suite", maxOccupancy: 4, baseAdults: 2 },
    { id: "rt_marina_villa", propertyId: "prop_marina", code: "VLA", name: "Marina Villa", maxOccupancy: 6, baseAdults: 4 }
  ];

  const rooms = [
    { id: "room_101", propertyId: "prop_playa", roomTypeId: "rt_playa_std", roomNumber: "101", floor: "1", status: "vacant_clean", version: 1 },
    { id: "room_102", propertyId: "prop_playa", roomTypeId: "rt_playa_std", roomNumber: "102", floor: "1", status: "vacant_clean", version: 1 },
    { id: "room_201", propertyId: "prop_playa", roomTypeId: "rt_playa_suite", roomNumber: "201", floor: "2", status: "vacant_clean", version: 1 },
    { id: "room_m1", propertyId: "prop_marina", roomTypeId: "rt_marina_villa", roomNumber: "M-1", floor: "Villa", status: "vacant_clean", version: 1 }
  ];

  const ratePlans = [
    { id: "rp_playa_bar", propertyId: "prop_playa", code: "BAR", name: "Best Available Rate", currency: "USD" },
    { id: "rp_marina_bar", propertyId: "prop_marina", code: "BAR", name: "Best Available Rate", currency: "USD" }
  ];

  const rateRules = [
    { id: "rr_std", ratePlanId: "rp_playa_bar", roomTypeId: "rt_playa_std", validFrom: "2026-07-01", validTo: "2026-12-31", amount: 180, taxRate: 0.13 },
    { id: "rr_suite", ratePlanId: "rp_playa_bar", roomTypeId: "rt_playa_suite", validFrom: "2026-07-01", validTo: "2026-12-31", amount: 340, taxRate: 0.13 },
    { id: "rr_villa", ratePlanId: "rp_marina_bar", roomTypeId: "rt_marina_villa", validFrom: "2026-07-01", validTo: "2026-12-31", amount: 520, taxRate: 0.13 }
  ];

  const inventoryDays = [];
  for (const roomType of roomTypes) {
    const physicalCount = rooms.filter((room) => room.roomTypeId === roomType.id).length;
    for (const stayDate of eachStayDate("2026-07-01", "2026-08-01")) {
      inventoryDays.push({
        id: `inv_${roomType.id}_${stayDate}`,
        propertyId: roomType.propertyId,
        roomTypeId: roomType.id,
        stayDate,
        physicalCount,
        outOfOrderCount: 0,
        reservedCount: 0,
        overbookingLimit: 0,
        version: 1
      });
    }
  }

  return {
    holding,
    properties,
    roomTypes,
    rooms,
    ratePlans,
    rateRules,
    inventoryDays,
    guests: [],
    reservations: [],
    reservationNights: [],
    stays: [],
    roomAssignments: [],
    folios: [],
    folioTransactions: [],
    auditEvents: [],
    sequences: {
      reservation: 1
    }
  };
}
