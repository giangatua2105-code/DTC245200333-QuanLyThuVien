const session = require("express-session");
module.exports = function createStore(db) {
  class Store extends session.Store {
    get(sid, cb) {
      db.query("SELECT data FROM sessions WHERE sid=$1 AND expires>NOW()", [
        sid,
      ])
        .then((r) => cb(null, r.rows[0]?.data))
        .catch(cb);
    }
    set(sid, data, cb) {
      db.query(
        "INSERT INTO sessions VALUES($1,$2,$3) ON CONFLICT(sid) DO UPDATE SET data=$2,expires=$3",
        [sid, JSON.stringify(data), new Date(Date.now() + 8 * 3600000)],
      )
        .then(() => cb())
        .catch(cb);
    }
    destroy(sid, cb) {
      db.query("DELETE FROM sessions WHERE sid=$1", [sid])
        .then(() => cb())
        .catch(cb);
    }
  }
  return new Store();
};
