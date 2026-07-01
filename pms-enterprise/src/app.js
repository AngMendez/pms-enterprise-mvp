import { createAuditService } from "./contexts/audit/audit.service.js";
import { createBillingService } from "./contexts/billing/billing.service.js";
import { createFrontDeskService } from "./contexts/front-desk/front-desk.service.js";
import { createInventoryService } from "./contexts/inventory/inventory.service.js";
import { createPropertyService } from "./contexts/property/property.service.js";
import { createReservationsService } from "./contexts/reservations/reservations.service.js";
import { createRepository } from "./store/repository.js";

export function createApp(repo = createRepository()) {
  const audit = createAuditService(repo);
  const inventory = createInventoryService(repo);
  const billing = createBillingService(repo, audit);
  const property = createPropertyService(repo);
  const reservations = createReservationsService(repo, inventory, audit);
  const frontDesk = createFrontDeskService(repo, billing, audit);

  return {
    repo,
    services: { audit, billing, frontDesk, inventory, property, reservations }
  };
}
