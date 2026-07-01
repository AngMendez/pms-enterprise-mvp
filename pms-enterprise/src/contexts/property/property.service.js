export function createPropertyService(repo) {
  return {
    listProperties() {
      return repo.list("properties");
    },
    getProperty(id) {
      const property = repo.find("properties", (item) => item.id === id);
      if (!property) {
        const error = new Error("Property not found.");
        error.status = 404;
        throw error;
      }
      return property;
    },
    listRoomTypes(propertyId) {
      return repo.list("roomTypes").filter((item) => item.propertyId === propertyId);
    },
    listRooms(propertyId) {
      return repo.list("rooms").filter((item) => item.propertyId === propertyId);
    },
    listRatePlans(propertyId) {
      return repo.list("ratePlans").filter((item) => item.propertyId === propertyId);
    }
  };
}
