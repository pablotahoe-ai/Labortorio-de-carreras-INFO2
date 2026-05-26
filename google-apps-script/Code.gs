const SHEET_NAMES = {
  state: "State",
  students: "Students",
  cars: "Cars",
  setups: "Setups",
  results: "Results",
};

const SHARED_KEYS = ["students", "cars", "setups", "results", "nextCodeNumber"];

function doGet(event) {
  const payload = {
    ok: true,
    state: getSharedState(),
    updatedAt: new Date().toISOString(),
  };
  if (event && event.parameter && event.parameter.callback) {
    return javascriptResponse(`${event.parameter.callback}(${JSON.stringify(payload)});`);
  }
  return jsonResponse(payload);
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const payload = parsePayload(event);
    const current = getSharedState();
    const incoming = normalizeSharedState(payload.state || {});
    const merged = payload.replace ? incoming : mergeSharedState(current, incoming);
    repairCodes(merged);
    saveSharedState(merged);
    mirrorSheets(merged);
    return jsonResponse({
      ok: true,
      state: merged,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: String(error && error.message ? error.message : error),
    });
  } finally {
    lock.releaseLock();
  }
}

function parsePayload(event) {
  if (!event || !event.postData || !event.postData.contents) return {};
  return JSON.parse(event.postData.contents);
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function javascriptResponse(value) {
  return ContentService
    .createTextOutput(value)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureSheet(name) {
  const spreadsheet = getSpreadsheet();
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function getSharedState() {
  const sheet = ensureSheet(SHEET_NAMES.state);
  const raw = sheet.getRange("A1").getValue();
  if (!raw) return normalizeSharedState({});
  try {
    return normalizeSharedState(JSON.parse(raw));
  } catch (error) {
    return normalizeSharedState({});
  }
}

function saveSharedState(state) {
  const sheet = ensureSheet(SHEET_NAMES.state);
  sheet.getRange("A1").setValue(JSON.stringify(normalizeSharedState(state)));
  sheet.getRange("A2").setValue(new Date().toISOString());
}

function normalizeSharedState(state) {
  return {
    students: Array.isArray(state.students) ? state.students : [],
    cars: Array.isArray(state.cars) ? state.cars : [],
    setups: Array.isArray(state.setups) ? state.setups : [],
    results: Array.isArray(state.results) ? state.results : [],
    nextCodeNumber: Number(state.nextCodeNumber) || 1,
  };
}

function mergeSharedState(current, incoming) {
  return {
    students: mergeById(current.students, incoming.students),
    cars: mergeById(current.cars, incoming.cars),
    setups: mergeById(current.setups, incoming.setups),
    results: mergeById(current.results, incoming.results),
    nextCodeNumber: Math.max(Number(current.nextCodeNumber) || 1, Number(incoming.nextCodeNumber) || 1),
  };
}

function mergeById(currentRows, incomingRows) {
  const map = new Map();
  currentRows.forEach((row) => {
    if (row && row.id) map.set(row.id, row);
  });
  incomingRows.forEach((row) => {
    if (row && row.id) map.set(row.id, Object.assign({}, map.get(row.id) || {}, row));
  });
  return Array.from(map.values());
}

function repairCodes(state) {
  const used = new Set();
  let maxNumber = 0;
  state.students
    .slice()
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
    .forEach((student) => {
      const codeNumber = codeToNumber(student.code);
      if (codeNumber) maxNumber = Math.max(maxNumber, codeNumber);
      if (!isValidCode(student.code) || used.has(normalizeCode(student.code))) {
        maxNumber += 1;
        student.code = `UNMdP_${String(maxNumber).padStart(4, "0")}`;
      }
      used.add(normalizeCode(student.code));
    });
  state.nextCodeNumber = Math.max(Number(state.nextCodeNumber) || 1, maxNumber + 1);
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function isValidCode(code) {
  return /^UNMDP_\d{4,}$/i.test(String(code || "").trim());
}

function codeToNumber(code) {
  const match = String(code || "").trim().match(/^UNMdP_(\d+)$/i);
  return match ? Number(match[1]) : 0;
}

function mirrorSheets(state) {
  writeRows(SHEET_NAMES.students, ["id", "code", "surnameOne", "surnameTwo", "normalizedKey", "createdAt"], state.students);
  writeRows(SHEET_NAMES.cars, ["id", "studentId", "name", "iconId", "createdAt"], state.cars);
  writeRows(SHEET_NAMES.setups, ["id", "studentId", "carId", "date", "wheelbase", "wheelDiameter", "weight", "notes", "finalized", "createdAt", "updatedAt"], state.setups);
  writeRows(SHEET_NAMES.results, ["id", "setupId", "studentId", "carId", "date", "distance", "notes", "wheelbase", "wheelDiameter", "weight", "createdAt"], state.results);
  writeStudentSheets(state);
}

function writeRows(sheetName, headers, rows) {
  const sheet = ensureSheet(sheetName);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!rows.length) return;
  const values = rows.map((row) => headers.map((header) => row[header] === undefined ? "" : row[header]));
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function writeStudentSheets(state) {
  state.students
    .slice()
    .sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")))
    .forEach((student) => writeStudentSheet(state, student));
}

function writeStudentSheet(state, student) {
  const sheet = ensureSheet(studentSheetName(student));
  const car = state.cars.find((item) => item.studentId === student.id) || {};
  const setups = state.setups
    .filter((setup) => setup.studentId === student.id)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const results = state.results
    .filter((result) => result.studentId === student.id)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || Number(b.distance || 0) - Number(a.distance || 0));

  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([["Design Race Lab", "Ficha por equipo"]]);
  sheet.getRange(3, 1, 6, 2).setValues([
    ["codigo", student.code || ""],
    ["apellido_1", student.surnameOne || ""],
    ["apellido_2", student.surnameTwo || ""],
    ["student_id", student.id || ""],
    ["creado", student.createdAt || ""],
    ["auto", car.name || ""],
  ]);
  sheet.getRange(10, 1, 1, 5).setValues([["car_id", "icono_auto", "nombre_auto", "student_id", "creado"]]);
  sheet.getRange(11, 1, 1, 5).setValues([[car.id || "", car.iconId || "", car.name || "", car.studentId || "", car.createdAt || ""]]);

  const setupHeaders = ["setup_id", "fecha", "largo_ejes_mm", "diametro_rueda_mm", "peso_g", "anotaciones", "finalizado", "creado", "actualizado"];
  sheet.getRange(14, 1, 1, setupHeaders.length).setValues([setupHeaders]);
  if (setups.length) {
    sheet.getRange(15, 1, setups.length, setupHeaders.length).setValues(setups.map((setup) => [
      setup.id || "",
      setup.date || "",
      setup.wheelbase || "",
      setup.wheelDiameter || "",
      setup.weight || "",
      setup.notes || "",
      setup.finalized || false,
      setup.createdAt || "",
      setup.updatedAt || "",
    ]));
  }

  const resultStart = 17 + Math.max(setups.length, 1);
  const resultHeaders = ["result_id", "setup_id", "fecha", "distancia_m", "anotaciones", "largo_ejes_mm", "diametro_rueda_mm", "peso_g", "creado"];
  sheet.getRange(resultStart, 1, 1, resultHeaders.length).setValues([resultHeaders]);
  if (results.length) {
    sheet.getRange(resultStart + 1, 1, results.length, resultHeaders.length).setValues(results.map((result) => [
      result.id || "",
      result.setupId || "",
      result.date || "",
      result.distance || "",
      result.notes || "",
      result.wheelbase || "",
      result.wheelDiameter || "",
      result.weight || "",
      result.createdAt || "",
    ]));
  }

  sheet.autoResizeColumns(1, 9);
}

function studentSheetName(student) {
  const code = String(student.code || "SIN_CODIGO");
  const surnames = `${student.surnameOne || ""} ${student.surnameTwo || ""}`.trim();
  const base = `${code} ${surnames}`.trim();
  return sanitizeSheetName(base || String(student.id || "Equipo"));
}

function sanitizeSheetName(name) {
  return String(name)
    .replace(/[\[\]\*\/\\\?:]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 99);
}
