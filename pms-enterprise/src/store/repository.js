import { createSeedData } from "./seed.js";

export function createRepository(seed = createSeedData()) {
  const state = structuredClone(seed);

  return {
    state,
    list(collection) {
      return state[collection];
    },
    find(collection, predicate) {
      return state[collection].find(predicate);
    },
    insert(collection, record) {
      state[collection].push(record);
      return record;
    },
    update(collection, id, patch) {
      const record = state[collection].find((item) => item.id === id);
      if (!record) {
        const error = new Error(`${collection} record not found.`);
        error.status = 404;
        throw error;
      }
      Object.assign(record, patch);
      return record;
    },
    next(sequence) {
      const value = state.sequences[sequence];
      state.sequences[sequence] += 1;
      return value;
    }
  };
}
