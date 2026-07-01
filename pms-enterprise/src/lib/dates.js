export function toDateOnly(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function eachStayDate(arrivalDate, departureDate) {
  const dates = [];
  const cursor = toDateOnly(arrivalDate);
  const end = toDateOnly(departureDate);

  while (cursor < end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function assertDateRange(arrivalDate, departureDate) {
  if (!arrivalDate || !departureDate || toDateOnly(departureDate) <= toDateOnly(arrivalDate)) {
    const error = new Error("Departure date must be after arrival date.");
    error.status = 400;
    throw error;
  }
}
