import { id } from "../../lib/ids.js";

export function createAuditService(repo) {
  function record({ propertyId, actor = "system", entityType, entityId, action, before = null, after = null }) {
    const property = propertyId ? repo.find("properties", (item) => item.id === propertyId) : null;
    return repo.insert("auditEvents", {
      id: id("audit"),
      holdingId: property?.holdingId || repo.state.holding.id,
      propertyId,
      actor,
      entityType,
      entityId,
      action,
      before,
      after,
      createdAt: new Date().toISOString()
    });
  }

  return { record };
}
