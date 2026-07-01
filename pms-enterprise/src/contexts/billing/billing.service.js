import { id } from "../../lib/ids.js";

export function createBillingService(repo, audit) {
  function openFolio({ propertyId, stayId, currency = "USD" }) {
    const folio = repo.insert("folios", {
      id: id("folio"),
      stayId,
      propertyId,
      folioType: "guest",
      status: "open",
      currency,
      openedAt: new Date().toISOString(),
      closedAt: null
    });
    audit.record({ propertyId, entityType: "folio", entityId: folio.id, action: "folio.opened", after: folio });
    return folio;
  }

  function postTransaction({ folioId, transactionType, description, amount, sourceModule = "billing", sourceReference = null }) {
    const folio = repo.find("folios", (item) => item.id === folioId);
    if (!folio || folio.status !== "open") {
      const error = new Error("Folio is not open.");
      error.status = 409;
      throw error;
    }
    const property = repo.find("properties", (item) => item.id === folio.propertyId);
    const transaction = repo.insert("folioTransactions", {
      id: id("txn"),
      folioId,
      propertyId: folio.propertyId,
      businessDate: property.businessDate,
      transactionType,
      description,
      amount: Number(amount),
      currency: folio.currency,
      sourceModule,
      sourceReference,
      postedAt: new Date().toISOString(),
      voidsTransactionId: null
    });
    audit.record({ propertyId: folio.propertyId, entityType: "folio_transaction", entityId: transaction.id, action: "transaction.posted", after: transaction });
    return transaction;
  }

  function getFolio(folioId) {
    const folio = repo.find("folios", (item) => item.id === folioId);
    if (!folio) {
      const error = new Error("Folio not found.");
      error.status = 404;
      throw error;
    }
    const transactions = repo.list("folioTransactions").filter((item) => item.folioId === folioId);
    const balance = transactions.reduce((sum, txn) => sum + txn.amount, 0);
    const roundedBalance = Number(balance.toFixed(2));
    return { ...folio, transactions, balance: Object.is(roundedBalance, -0) ? 0 : roundedBalance };
  }

  function closeFolio(folioId) {
    const summary = getFolio(folioId);
    if (summary.balance !== 0) {
      const error = new Error("Folio balance must be zero before checkout.");
      error.status = 409;
      throw error;
    }
    const folio = repo.update("folios", folioId, { status: "closed", closedAt: new Date().toISOString() });
    audit.record({ propertyId: folio.propertyId, entityType: "folio", entityId: folio.id, action: "folio.closed", after: folio });
    return getFolio(folioId);
  }

  return { openFolio, postTransaction, getFolio, closeFolio };
}
