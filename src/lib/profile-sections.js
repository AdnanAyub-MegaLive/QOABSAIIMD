export function profileSections(report = (fields, error) => console.error("Profile section failed", { fields, name: error?.name, code: error?.code })) {
  const unavailable = new Set();
  return {
    unavailable,
    async read(fields, load, fallback) {
      try { return await load(); }
      catch (error) {
        fields.forEach(field => unavailable.add(field));
        report(fields, error);
        return fallback;
      }
    },
  };
}
