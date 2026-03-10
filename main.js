

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


module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
   
};
