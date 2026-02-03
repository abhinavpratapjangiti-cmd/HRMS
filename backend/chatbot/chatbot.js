const express = require("express");
const router = express.Router();

router.post("/", (req, res) => {
    const { message } = req.body;
    let reply = "Sorry, I didn't understand that.";

    if (message.includes("leave")) reply = "You can apply for leave in the Leave section.";
    if (message.includes("holiday")) reply = "You can view holidays in the Holiday Calendar.";
    if (message.includes("attendance")) reply = "Go to Attendance and press Mark Attendance.";
    if (message.includes("timesheet")) reply = "Submit your timesheet under the Timesheet tab.";
    if (message.includes("salary")) reply = "You can download your salary slip in the Payslip section.";

    res.json({ reply });
});

module.exports = router;
