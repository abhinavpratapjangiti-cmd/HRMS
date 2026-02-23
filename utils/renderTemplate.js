const fs = require("fs");
const path = require("path");

module.exports = function renderTemplate(templateName, data) {
  let html = fs.readFileSync(
    path.join(__dirname, `../templates/${templateName}`),
    "utf8"
  );

  // Simple mustache-style replacement
  for (const key in data) {
    const regex = new RegExp(`{{${key}}}`, "g");
    html = html.replace(regex, data[key] ?? "");
  }

  return html;
};
