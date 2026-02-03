const bcrypt = require("bcrypt");
const db = require("./db");

function reset() {
  const plainPassword = "123456"; // 👈 use this to login

  bcrypt
    .hash(plainPassword, 10)
    .then(hashed => {
      const sql = "UPDATE employees SET password = ? WHERE email = ?";
      return db.query(sql, [hashed, "ravi@test.com"]);
    })
    .then(() => {
      console.log("✅ Password reset to 123456");
      process.exit();
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

reset();
