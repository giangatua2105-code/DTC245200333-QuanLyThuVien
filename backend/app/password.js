const { scryptSync, randomBytes, timingSafeEqual } = require("crypto");
exports.hash = (p) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(p, salt, 64).toString("hex");
};
exports.verify = (p, h) => {
  try {
    const [s, k] = h.split(":");
    return timingSafeEqual(scryptSync(p, s, 64), Buffer.from(k, "hex"));
  } catch {
    return false;
  }
};
