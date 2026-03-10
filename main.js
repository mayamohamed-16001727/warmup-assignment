

// ============================================================
// HELPERS
// ============================================================

// Convert "h:mm:ss am/pm" to total seconds
function timeToSeconds(timeStr) {
    const cleaned = timeStr.trim().replace(/\s+/g, " ");
    const parts = cleaned.split(" ");
    const period = parts[1] ? parts[1].trim().toLowerCase() : null;
    const timeParts = parts[0].split(":");
    let hours = parseInt(timeParts[0]);
    const minutes = parseInt(timeParts[1]);
    const seconds = parseInt(timeParts[2]);

    if (period === "am") {
        if (hours === 12) hours = 0;
    } else if (period === "pm") {
        if (hours !== 12) hours += 12;
    }

    return hours * 3600 + minutes * 60 + seconds;
}

// Convert total seconds to "h:mm:ss"
function secondsToTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Convert "h:mm:ss" or "hhh:mm:ss" to total seconds
function durationToSeconds(durStr) {
    const parts = durStr.trim().split(":");
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
}

// Parse a shifts.txt line into a structured object
function parseLine(line) {
    const cols = line.split(",");
    return {
        driverID:      cols[0].trim(),
        driverName:    cols[1].trim(),
        date:          cols[2].trim(),
        startTime:     cols[3].trim(),
        endTime:       cols[4].trim(),
        shiftDuration: cols[5].trim(),
        idleTime:      cols[6].trim(),
        activeTime:    cols[7].trim(),
        metQuota:      cols[8].trim() === "true",
        hasBonus:      cols[9].trim() === "true"
    };
}

// Read all non-empty lines from a file
function readLines(filePath) {
    const content = fs.readFileSync(filePath, { encoding: "utf8" });
    return content.split("\n").filter(l => l.trim() !== "");
}

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// ============================================================
function getShiftDuration(startTime, endTime) {
    const SECONDS_IN_DAY = 24 * 3600;
    const startSec = timeToSeconds(startTime);
    let endSec = timeToSeconds(endTime);
    if (endSec < startSec) endSec += SECONDS_IN_DAY;
    return secondsToTime(endSec - startSec);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// Delivery hours: 8:00 AM to 10:00 PM
// ============================================================
function getIdleTime(startTime, endTime) {
    const SECONDS_IN_DAY = 24 * 3600;
    const deliveryStart = 8 * 3600;
    const deliveryEnd   = 22 * 3600;

    const startSec = timeToSeconds(startTime);
    let endSec = timeToSeconds(endTime);
    if (endSec < startSec) endSec += SECONDS_IN_DAY;

    let idleSec = 0;

    if (startSec < deliveryStart) {
        idleSec += Math.min(endSec, deliveryStart) - startSec;
    }
    if (endSec > deliveryEnd) {
        idleSec += endSec - Math.max(startSec, deliveryEnd);
    }

    return secondsToTime(idleSec);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    return secondsToTime(durationToSeconds(shiftDuration) - durationToSeconds(idleTime));
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// Normal quota: 8h 24m | Eid (Apr 10-30 2025): 6h
// ============================================================
function metQuota(date, activeTime) {
    const normalQuota = 8 * 3600 + 24 * 60;
    const eidQuota    = 6 * 3600;

    const d        = new Date(date);
    const eidStart = new Date("2025-04-10");
    const eidEnd   = new Date("2025-04-30");

    const quota = (d >= eidStart && d <= eidEnd) ? eidQuota : normalQuota;
    return durationToSeconds(activeTime) >= quota;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    const { driverID, driverName, date, startTime, endTime } = shiftObj;

    let content = "";
    try { content = fs.readFileSync(textFile, { encoding: "utf8" }); } catch (e) {}
    const lines = content.split("\n").filter(l => l.trim() !== "");

    // Duplicate check
    for (const line of lines) {
        const cols = line.split(",");
        if (cols[0].trim() === driverID && cols[2].trim() === date) return {};
    }

    const shiftDuration = getShiftDuration(startTime, endTime);
    const idleTime      = getIdleTime(startTime, endTime);
    const activeTime    = getActiveTime(shiftDuration, idleTime);
    const quota         = metQuota(date, activeTime);
    const hasBonus      = false;

    const newRecord = { driverID, driverName, date, startTime, endTime,
                        shiftDuration, idleTime, activeTime, metQuota: quota, hasBonus };

    const newLine = `${driverID},${driverName},${date},${startTime},${endTime},${shiftDuration},${idleTime},${activeTime},${quota},${hasBonus}`;

    // Insert after last record of same driverID, or append at end
    let insertIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].split(",")[0].trim() === driverID) { insertIndex = i; break; }
    }

    if (insertIndex === -1) lines.push(newLine);
    else lines.splice(insertIndex + 1, 0, newLine);

    fs.writeFileSync(textFile, lines.join("\n") + "\n", { encoding: "utf8" });
    return newRecord;
}


// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// Finds the row matching driverID + date and updates hasBonus
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    const lines = readLines(textFile);

    const updated = lines.map(line => {
        const cols = line.split(",");
        if (cols[0].trim() === driverID && cols[2].trim() === date) {
            cols[9] = newValue.toString();
            return cols.join(",");
        }
        return line;
    });

    fs.writeFileSync(textFile, updated.join("\n") + "\n", { encoding: "utf8" });
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// Returns count of records where hasBonus=true for given driver+month
// Returns -1 if driverID not found at all
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    const lines = readLines(textFile);
    const targetMonth = parseInt(month); // normalise "04" and "4" both to 4

    let driverFound = false;
    let count = 0;

    for (const line of lines) {
        const record = parseLine(line);
        if (record.driverID !== driverID) continue;
        driverFound = true;

        const recordMonth = parseInt(record.date.split("-")[1]);
        if (recordMonth === targetMonth && record.hasBonus) count++;
    }

    return driverFound ? count : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// Sums all activeTime values for driver in given month (including day-off days)
// Returns string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const lines = readLines(textFile);
    const targetMonth = parseInt(month);
    let totalSeconds = 0;

    for (const line of lines) {
        const record = parseLine(line);
        if (record.driverID !== driverID) continue;
        const recordMonth = parseInt(record.date.split("-")[1]);
        if (recordMonth !== targetMonth) continue;
        totalSeconds += durationToSeconds(record.activeTime);
    }

    return secondsToTime(totalSeconds);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// Sums required daily quota for each worked day (excluding driver's day off)
// Reduces total by 2h per bonus
// Returns string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const shiftLines = readLines(textFile);
    const rateLines  = readLines(rateFile);

    // Get driver's dayOff from rateFile
    let dayOff = null;
    for (const line of rateLines) {
        const cols = line.split(",");
        if (cols[0].trim() === driverID) {
            dayOff = cols[1].trim(); // e.g. "Friday"
            break;
        }
    }

    const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const targetMonth = parseInt(month);

    const normalQuota = 8 * 3600 + 24 * 60; // 30240 sec
    const eidQuota    = 6 * 3600;            // 21600 sec
    const eidStart    = new Date("2025-04-10");
    const eidEnd      = new Date("2025-04-30");

    let totalSeconds = 0;

    for (const line of shiftLines) {
        const record = parseLine(line);
        if (record.driverID !== driverID) continue;
        const recordMonth = parseInt(record.date.split("-")[1]);
        if (recordMonth !== targetMonth) continue;

        const d = new Date(record.date);
        const dayName = DAY_NAMES[d.getDay()];

        // Skip day-off days
        if (dayOff && dayName === dayOff) continue;

        // Pick quota based on Eid period
        const quota = (d >= eidStart && d <= eidEnd) ? eidQuota : normalQuota;
        totalSeconds += quota;
    }

    // Each bonus reduces required hours by 2h
    totalSeconds -= bonusCount * 2 * 3600;
    if (totalSeconds < 0) totalSeconds = 0;

    return secondsToTime(totalSeconds);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// Calculates net pay after deductions based on tier allowance
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rateLines = readLines(rateFile);

    let basePay = 0;
    let tier = 0;

    for (const line of rateLines) {
        const cols = line.split(",");
        if (cols[0].trim() === driverID) {
            basePay = parseInt(cols[2].trim());
            tier    = parseInt(cols[3].trim());
            break;
        }
    }

    // Allowed missing hours per tier (no deduction up to this many hours)
    const allowedMissingHours = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowed = allowedMissingHours[tier] || 0;

    const actualSec   = durationToSeconds(actualHours);
    const requiredSec = durationToSeconds(requiredHours);

    // No deduction if actual >= required
    if (actualSec >= requiredSec) return basePay;

    const missingSec   = requiredSec - actualSec;
    const missingHours = missingSec / 3600; // in hours (may be fractional)

    // Subtract the allowed missing hours
    const billableHours = missingHours - allowed;

    // If within allowance, no deduction
    if (billableHours <= 0) return basePay;

    // Only full hours count
    const billableFullHours = Math.floor(billableHours);

    const deductionRatePerHour = Math.floor(basePay / 185);
    const salaryDeduction      = billableFullHours * deductionRatePerHour;

    return basePay - salaryDeduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};

