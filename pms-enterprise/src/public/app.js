const state = {
  propertyId: "prop_playa",
  config: null,
  activeFolioId: null
};

const els = {
  propertySelect: document.querySelector("#propertySelect"),
  propertyName: document.querySelector("#propertyName"),
  businessDate: document.querySelector("#businessDate"),
  title: document.querySelector("#title"),
  arrivalDate: document.querySelector("#arrivalDate"),
  departureDate: document.querySelector("#departureDate"),
  roomTypeSelect: document.querySelector("#roomTypeSelect"),
  ratePlanSelect: document.querySelector("#ratePlanSelect"),
  availabilityResults: document.querySelector("#availabilityResults"),
  reservationForm: document.querySelector("#reservationForm"),
  reservationList: document.querySelector("#reservationList"),
  guestName: document.querySelector("#guestName"),
  guestEmail: document.querySelector("#guestEmail"),
  folioHint: document.querySelector("#folioHint"),
  folioDetail: document.querySelector("#folioDetail"),
  manualChargeForm: document.querySelector("#manualChargeForm"),
  manualChargeDescription: document.querySelector("#manualChargeDescription"),
  manualChargeAmount: document.querySelector("#manualChargeAmount")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error);
  return payload;
}

async function loadProperties() {
  const properties = await api("/api/properties");
  els.propertySelect.innerHTML = properties.map((property) => `<option value="${property.id}">${property.name}</option>`).join("");
  els.propertySelect.value = state.propertyId;
}

async function loadConfig() {
  state.config = await api(`/api/config?propertyId=${state.propertyId}`);
  els.propertyName.textContent = state.config.property.name;
  els.businessDate.textContent = `Fecha negocio ${state.config.property.businessDate}`;
  els.roomTypeSelect.innerHTML = state.config.roomTypes.map((roomType) => `<option value="${roomType.id}">${roomType.code} - ${roomType.name}</option>`).join("");
  els.ratePlanSelect.innerHTML = state.config.ratePlans.map((ratePlan) => `<option value="${ratePlan.id}">${ratePlan.code} - ${ratePlan.name}</option>`).join("");
  await searchAvailability();
  await renderReservations();
}

async function searchAvailability() {
  const query = new URLSearchParams({
    propertyId: state.propertyId,
    roomTypeId: els.roomTypeSelect.value,
    arrivalDate: els.arrivalDate.value,
    departureDate: els.departureDate.value
  });
  const nights = await api(`/api/availability?${query}`);
  els.availabilityResults.innerHTML = nights.map((night) => `
    <article class="card">
      <h3>${night.stayDate}</h3>
      <strong>${night.availableCount}</strong>
      <p>Disponibles de ${night.physicalCount} fisicas</p>
      <span class="status">${night.reservedCount} reservadas</span>
    </article>
  `).join("");
}

async function createReservation(event) {
  event.preventDefault();
  await api("/api/reservations", {
    method: "POST",
    body: JSON.stringify({
      propertyId: state.propertyId,
      roomTypeId: els.roomTypeSelect.value,
      ratePlanId: els.ratePlanSelect.value,
      arrivalDate: els.arrivalDate.value,
      departureDate: els.departureDate.value,
      guestName: els.guestName.value,
      guestEmail: els.guestEmail.value,
      source: "front_desk"
    })
  });
  await searchAvailability();
  await renderReservations();
}

async function renderReservations() {
  const reservations = await api(`/api/reservations?propertyId=${state.propertyId}`);
  els.reservationList.innerHTML = reservations.length ? reservations.map((reservation) => `
    <article class="card">
      <h3>${reservation.confirmationNumber} - ${reservation.guestName}</h3>
      <p>${reservation.arrivalDate} a ${reservation.departureDate} - Total USD ${reservation.total.toFixed(2)}</p>
      <span class="status">${reservation.status}</span>
      ${reservation.status === "confirmed" ? `
        <button data-checkin="${reservation.id}" type="button">Check-in</button>
        <button data-modify="${reservation.id}" type="button">Modificar a busqueda actual</button>
        <button data-cancel="${reservation.id}" type="button">Cancelar</button>
      ` : ""}
    </article>
  `).join("") : `<div class="panel">No hay reservas para esta propiedad.</div>`;
}

async function modifyReservation(reservationId) {
  await api(`/api/reservations/${reservationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      roomTypeId: els.roomTypeSelect.value,
      ratePlanId: els.ratePlanSelect.value,
      arrivalDate: els.arrivalDate.value,
      departureDate: els.departureDate.value
    })
  });
  await searchAvailability();
  await renderReservations();
}

async function cancelReservation(reservationId) {
  await api(`/api/reservations/${reservationId}/cancel`, { method: "POST", body: "{}" });
  await searchAvailability();
  await renderReservations();
}

async function checkIn(reservationId) {
  const result = await api(`/api/reservations/${reservationId}/check-in`, { method: "POST", body: "{}" });
  state.activeFolioId = result.folio.id;
  await renderReservations();
  renderFolio(result.folio);
  activate("folio");
}

async function renderActiveFolio() {
  if (!state.activeFolioId) return;
  renderFolio(await api(`/api/folios/${state.activeFolioId}`));
}

function renderFolio(folio) {
  els.folioHint.textContent = `Folio ${folio.id} - Balance USD ${folio.balance.toFixed(2)}`;
  els.manualChargeForm.classList.toggle("is-hidden", folio.status !== "open");
  els.folioDetail.innerHTML = `
    <table>
      <thead><tr><th>Tipo</th><th>Descripcion</th><th>Monto</th></tr></thead>
      <tbody>
        ${folio.transactions.map((txn) => `<tr><td>${txn.transactionType}</td><td>${txn.description}</td><td>${txn.amount.toFixed(2)}</td></tr>`).join("")}
      </tbody>
    </table>
    <div class="toolbar">
      <button data-pay="${folio.id}" type="button">Registrar pago total</button>
      <button data-checkout="${folio.stayId}" type="button">Check-out</button>
    </div>
  `;
}

async function payFolio(folioId) {
  const folio = await api(`/api/folios/${folioId}`);
  if (folio.balance <= 0) return;
  await api(`/api/folios/${folioId}/transactions`, {
    method: "POST",
    body: JSON.stringify({
      transactionType: "payment",
      description: "Payment tokenized card",
      amount: -folio.balance,
      sourceModule: "front_desk"
    })
  });
  await renderActiveFolio();
}

async function postManualCharge(event) {
  event.preventDefault();
  if (!state.activeFolioId) return;
  await api(`/api/folios/${state.activeFolioId}/transactions`, {
    method: "POST",
    body: JSON.stringify({
      transactionType: "charge",
      description: els.manualChargeDescription.value,
      amount: Number(els.manualChargeAmount.value),
      sourceModule: "front_desk"
    })
  });
  await renderActiveFolio();
}

async function checkOut(stayId) {
  await api(`/api/stays/${stayId}/check-out`, { method: "POST", body: "{}" });
  state.activeFolioId = null;
  els.folioHint.textContent = "Check-out completado. Habitacion queda vacant_dirty.";
  els.manualChargeForm.classList.add("is-hidden");
  els.folioDetail.innerHTML = "";
  await renderReservations();
}

function activate(view) {
  document.querySelectorAll(".nav").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  els.title.textContent = { availability: "Disponibilidad", reservations: "Reservas", folio: "Folio" }[view];
}

document.addEventListener("click", async (event) => {
  const nav = event.target.closest(".nav");
  if (nav) activate(nav.dataset.view);
  const checkin = event.target.closest("[data-checkin]");
  if (checkin) await checkIn(checkin.dataset.checkin);
  const modify = event.target.closest("[data-modify]");
  if (modify) await modifyReservation(modify.dataset.modify);
  const cancel = event.target.closest("[data-cancel]");
  if (cancel) await cancelReservation(cancel.dataset.cancel);
  const pay = event.target.closest("[data-pay]");
  if (pay) await payFolio(pay.dataset.pay);
  const checkout = event.target.closest("[data-checkout]");
  if (checkout) await checkOut(checkout.dataset.checkout);
});

els.propertySelect.addEventListener("change", async (event) => {
  state.propertyId = event.target.value;
  await loadConfig();
});
document.querySelector("#searchAvailability").addEventListener("click", searchAvailability);
els.reservationForm.addEventListener("submit", createReservation);
els.manualChargeForm.addEventListener("submit", postManualCharge);

await loadProperties();
await loadConfig();
