const SHEETS = {
  UBICACIONES: "Ubicaciones",
  DISPOSITIVOS: "Dispositivos",
  BITACORA: "Bitacora",
  OPCIONES: "Opciones",
  CONFIG: "Config",
};

const ADMIN_PASSWORD = "HRT123";
const SPREADSHEET_ID = "1YKtzGcpz-h42FMz6LnIW6fobkRYlJ3uhxRjNRF1YVUE";

const HEADERS = {
  [SHEETS.UBICACIONES]: ["id", "piso", "area", "subarea", "ordenPiso", "ordenArea", "activo"],
  [SHEETS.DISPOSITIVOS]: [
    "id",
    "nombreReal",
    "nombrePractico",
    "numeroSerie",
    "modelo",
    "tipoConexion",
    "direccionIP",
    "ubicacionOtro",
    "comentarioEstado",
    "ubicacionId",
    "fotoUrl",
    "fechaCreacion",
    "fechaActualizacion",
    "activo",
  ],
  [SHEETS.BITACORA]: ["id", "dispositivoId", "tipoEvento", "descripcion", "iniciales", "fechaHora"],
  [SHEETS.OPCIONES]: ["categoria", "valor", "activo"],
  [SHEETS.CONFIG]: ["clave", "valor"],
};

function doGet(e) {
  const action = e?.parameter?.action;
  if (action === "initDatabase") {
    initDatabase_();
    return jsonResponse_({ ok: true, data: { message: "Base inicializada" } });
  }
  return jsonResponse_({ ok: true, data: { message: "API Inventario Etiquetadoras activa" } });
}

function doPost(e) {
  try {
    const body = parseRequestBody_(e);
    const action = body.action;
    if (!action) throw new Error("Accion no informada");

    if (action === "adminLogin") {
      validateAdmin_(body.password);
      return jsonResponse_({ ok: true, data: { admin: true } });
    }
    if (action === "getBootstrapData") {
      return jsonResponse_({ ok: true, data: getBootstrapData_() });
    }
    if (action === "addBitacora") {
      const data = addBitacora_(body);
      return jsonResponse_({ ok: true, data });
    }
    if (action === "upsertLocation") {
      validateAdmin_(body.adminPassword);
      return jsonResponse_({ ok: true, data: upsertLocation_(body.location) });
    }
    if (action === "deleteLocation") {
      validateAdmin_(body.adminPassword);
      return jsonResponse_({ ok: true, data: deleteLocation_(body.id) });
    }
    if (action === "upsertDevice") {
      validateAdmin_(body.adminPassword);
      return jsonResponse_({ ok: true, data: upsertDevice_(body.device) });
    }
    if (action === "deleteDevice") {
      validateAdmin_(body.adminPassword);
      return jsonResponse_({ ok: true, data: deleteDevice_(body.id) });
    }
    if (action === "saveDevicePhoto") {
      validateAdmin_(body.adminPassword);
      return jsonResponse_({ ok: true, data: saveDevicePhoto_(body) });
    }
    throw new Error("Accion no soportada");
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message || String(error) });
  }
}

function initDatabase_() {
  const ss = getSpreadsheet_();
  Object.keys(HEADERS).forEach((sheetName) => {
    const sheet = getOrCreateSheet_(ss, sheetName);
    ensureHeaders_(sheet, HEADERS[sheetName]);
  });
  seedOptions_();
  seedConfig_();
  seedLocations_();
}

function getBootstrapData_() {
  const ss = getSpreadsheet_();
  const locations = getRowsAsObjects_(ss.getSheetByName(SHEETS.UBICACIONES)).filter((r) => truthy_(r.activo));
  const devices = getRowsAsObjects_(ss.getSheetByName(SHEETS.DISPOSITIVOS)).filter((r) => truthy_(r.activo));
  const bitacora = getRowsAsObjects_(ss.getSheetByName(SHEETS.BITACORA))
    .sort((a, b) => String(b.fechaHora).localeCompare(String(a.fechaHora)));
  const options = getRowsAsObjects_(ss.getSheetByName(SHEETS.OPCIONES)).filter((r) => truthy_(r.activo));
  return { locations, devices, bitacora, options };
}

function addBitacora_(payload) {
  if (!payload.dispositivoId || !payload.tipoEvento || !payload.descripcion || !payload.iniciales) {
    throw new Error("Faltan campos obligatorios para bitacora");
  }
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.BITACORA);
  const newRow = [
    generateId_("B"),
    payload.dispositivoId,
    payload.tipoEvento,
    payload.descripcion,
    String(payload.iniciales).toUpperCase().substring(0, 10),
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
  ];
  sheet.appendRow(newRow);
  return { id: newRow[0] };
}

function upsertLocation_(location) {
  if (!location || !location.piso || !location.area || !location.subarea) throw new Error("Ubicacion incompleta");
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.UBICACIONES);
  const headers = HEADERS[SHEETS.UBICACIONES];
  const data = getRowsAsObjects_(sheet);

  if (location.id) {
    const index = data.findIndex((r) => r.id === location.id);
    if (index < 0) throw new Error("Ubicacion no encontrada");
    const rowNumber = index + 2;
    const row = [
      location.id,
      location.piso,
      location.area,
      location.subarea,
      Number(location.ordenPiso || 0),
      Number(location.ordenArea || 0),
      true,
    ];
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
    return { id: location.id };
  }

  const id = generateId_("L");
  sheet.appendRow([id, location.piso, location.area, location.subarea, Number(location.ordenPiso || 0), Number(location.ordenArea || 0), true]);
  return { id };
}

function deleteLocation_(id) {
  if (!id) throw new Error("ID requerido");
  const ss = getSpreadsheet_();
  const devices = getRowsAsObjects_(ss.getSheetByName(SHEETS.DISPOSITIVOS)).filter((d) => truthy_(d.activo));
  if (devices.some((d) => d.ubicacionId === id)) throw new Error("La ubicacion tiene equipos asociados");
  softDeleteById_(ss.getSheetByName(SHEETS.UBICACIONES), id);
  return { id };
}

function upsertDevice_(device) {
  if (!device || !device.nombreReal || !device.nombrePractico || !device.numeroSerie || !device.ubicacionId) {
    throw new Error("Datos de equipo incompletos");
  }
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.DISPOSITIVOS);
  const headers = HEADERS[SHEETS.DISPOSITIVOS];
  const data = getRowsAsObjects_(sheet);
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  if (device.id) {
    const index = data.findIndex((r) => r.id === device.id);
    if (index < 0) throw new Error("Equipo no encontrado");
    const existing = data[index];
    const row = mapDeviceRow_(device.id, device, existing.fotoUrl || "", existing.fechaCreacion || now, now, true);
    sheet.getRange(index + 2, 1, 1, headers.length).setValues([row]);
    return { id: device.id };
  }

  const id = generateId_("D");
  sheet.appendRow(mapDeviceRow_(id, device, "", now, now, true));
  return { id };
}

function deleteDevice_(id) {
  if (!id) throw new Error("ID requerido");
  softDeleteById_(getSpreadsheet_().getSheetByName(SHEETS.DISPOSITIVOS), id);
  return { id };
}

function saveDevicePhoto_(payload) {
  if (!payload.deviceId || !payload.base64Data || !payload.mimeType) throw new Error("Faltan datos para guardar fotografia");
  const folderId = getConfigValue_("driveFolderId");
  if (!folderId) throw new Error("Configura driveFolderId en hoja Config");

  const bytes = Utilities.base64Decode(payload.base64Data);
  const blob = Utilities.newBlob(bytes, payload.mimeType, payload.fileName || `device_${payload.deviceId}.jpg`);
  const file = DriveApp.getFolderById(folderId).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = file.getUrl();

  const sheet = getSpreadsheet_().getSheetByName(SHEETS.DISPOSITIVOS);
  const data = getRowsAsObjects_(sheet);
  const idx = data.findIndex((d) => d.id === payload.deviceId);
  if (idx < 0) throw new Error("Equipo no encontrado");

  const rowNum = idx + 2;
  const headers = HEADERS[SHEETS.DISPOSITIVOS];
  const fotoCol = headers.indexOf("fotoUrl") + 1;
  const updateCol = headers.indexOf("fechaActualizacion") + 1;
  sheet.getRange(rowNum, fotoCol).setValue(url);
  sheet.getRange(rowNum, updateCol).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"));
  return { url };
}

function mapDeviceRow_(id, device, fotoUrl, fechaCreacion, fechaActualizacion, activo) {
  return [
    id,
    device.nombreReal,
    device.nombrePractico,
    device.numeroSerie,
    device.modelo || "",
    device.tipoConexion || "",
    device.direccionIP || "",
    device.ubicacionOtro || "",
    device.comentarioEstado || "",
    device.ubicacionId,
    fotoUrl,
    fechaCreacion,
    fechaActualizacion,
    activo,
  ];
}

function seedOptions_() {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.OPCIONES);
  if (sheet.getLastRow() > 1) return;
  const rows = [
    ["modelo", "ZD220", true],
    ["modelo", "ZD410", true],
    ["modelo", "LP2824", true],
    ["conexion", "Ethernet", true],
    ["conexion", "USB", true],
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function seedConfig_() {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.CONFIG);
  if (sheet.getLastRow() > 1) return;
  const rows = [
    ["driveFolderId", ""],
    ["nota", "Completar driveFolderId para habilitar fotos"],
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function seedLocations_() {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.UBICACIONES);
  if (sheet.getLastRow() > 1) return;
  const rows = buildInitialLocations_().map((loc) => [generateId_("L"), loc.piso, loc.area, loc.subarea, loc.ordenPiso, loc.ordenArea, true]);
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function buildInitialLocations_() {
  const rows = [];
  pushRange_(rows, "8vo piso (Medicina)", "Medicina", "Etiquetadora", 1, 4, 8, 1);
  pushRange_(rows, "7mo piso (Cirugia)", "Cirugia", "Cirugia sala", 1, 3, 7, 1);
  pushRange_(rows, "6to piso (Matroneria)", "Matroneria", "Matroneria sala", 1, 4, 6, 1);
  pushRange_(rows, "5to piso (Pediatria)", "Pediatria", "Sala", 1, 2, 5, 1);
  pushRange_(rows, "3er piso (Dialisis)", "Dialisis peritoneal", "Dialisis peritoneal", 1, 1, 3, 1);
  pushRange_(rows, "2do piso (UPCs)", "UPC Adulto", "UPC Adulto", 1, 4, 2, 1);
  pushRange_(rows, "2do piso (UPCs)", "UPC Neonatal", "UPC Neonatal", 1, 1, 2, 2);
  pushRange_(rows, "2do piso (UPCs)", "UPC Pediatria", "UPC Pediatria", 1, 2, 2, 3);
  pushRange_(rows, "1er piso (UEH, CDT)", "Urgencias", "Urgencias", 1, 5, 1, 1);
  pushRange_(rows, "1er piso (UEH, CDT)", "Clinica CDT", "Clinica CDT", 1, 6, 1, 2);
  pushRange_(rows, "1er piso (UEH, CDT)", "Psiquiatria Adultos Hosp", "Psiquiatria Adultos Hosp", 1, 1, 1, 3);
  pushRange_(rows, "1er piso (UEH, CDT)", "Hemostasia y trombosis", "Hemostasia y trombosis", 1, 1, 1, 4);
  pushRange_(rows, "1er piso (UEH, CDT)", "Poli oncologia", "Poli oncologia Sala", 1, 2, 1, 5);
  pushRange_(rows, "1er piso (UEH, CDT)", "UNACESS", "UNACESS", 1, 2, 1, 6);
  pushRange_(rows, "Subterraneo", "Policlinico oncologia infantil", "Poli onco infantil", 1, 2, 0, 1);
  pushRange_(rows, "Laboratorio", "Preanalisis", "Estacion", 1, 6, 9, 1);
  pushRange_(rows, "Laboratorio", "TBC", "Estacion", 1, 1, 9, 2);
  pushRange_(rows, "Laboratorio", "Parasitologia", "Estacion", 1, 2, 9, 3);
  pushRange_(rows, "Laboratorio", "AIC", "Cobas", 1, 1, 9, 4);
  rows.push({ piso: "Laboratorio", area: "Lavado", subarea: "Orinas", ordenPiso: 9, ordenArea: 5 });
  rows.push({ piso: "Laboratorio", area: "Bacteriologia", subarea: "Recepcion/ALU", ordenPiso: 9, ordenArea: 6 });
  rows.push({ piso: "Laboratorio", area: "Bacteriologia", subarea: "Urocultivos", ordenPiso: 9, ordenArea: 6 });
  rows.push({ piso: "Laboratorio", area: "Bacteriologia", subarea: "Secreciones", ordenPiso: 9, ordenArea: 6 });
  rows.push({ piso: "Laboratorio", area: "Bacteriologia", subarea: "Hemocultivos", ordenPiso: 9, ordenArea: 6 });
  rows.push({ piso: "Laboratorio", area: "Toma de muestras", subarea: "Recepcion 1", ordenPiso: 9, ordenArea: 7 });
  rows.push({ piso: "Laboratorio", area: "Toma de muestras", subarea: "Recepcion 2", ordenPiso: 9, ordenArea: 7 });
  rows.push({ piso: "Laboratorio", area: "Toma de muestras", subarea: "Extraccion", ordenPiso: 9, ordenArea: 7 });
  return rows;
}

function pushRange_(rows, piso, area, baseName, from, to, ordenPiso, ordenArea) {
  for (var i = from; i <= to; i++) {
    rows.push({ piso, area, subarea: `${baseName} ${i}`, ordenPiso, ordenArea });
  }
}

function getConfigValue_(key) {
  const data = getRowsAsObjects_(getSpreadsheet_().getSheetByName(SHEETS.CONFIG));
  const row = data.find((r) => r.clave === key);
  return row ? row.valor : "";
}

function validateAdmin_(password) {
  if (password !== ADMIN_PASSWORD) throw new Error("Contraseña invalida");
}

function softDeleteById_(sheet, id) {
  const headers = HEADERS[sheet.getName()];
  const data = getRowsAsObjects_(sheet);
  const idx = data.findIndex((r) => r.id === id);
  if (idx < 0) throw new Error("Registro no encontrado");
  const rowNumber = idx + 2;
  const col = headers.indexOf("activo") + 1;
  if (!col) throw new Error("La hoja no soporta borrado logico");
  sheet.getRange(rowNumber, col).setValue(false);
}

function getOrCreateSheet_(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
}

function getSpreadsheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "PEGAR_ID_DE_TU_GOOGLE_SHEET") {
    throw new Error("Configura SPREADSHEET_ID en Código.gs con el ID de tu Google Sheet");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function ensureHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsUpdate = headers.some((h, idx) => String(current[idx] || "") !== h);
  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function getRowsAsObjects_(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map((row) => {
    const out = {};
    headers.forEach((h, idx) => {
      out[h] = row[idx];
    });
    return out;
  });
}

function generateId_(prefix) {
  return `${prefix}_${Utilities.getUuid().slice(0, 8)}`;
}

function truthy_(value) {
  return value === true || String(value).toLowerCase() === "true" || String(value) === "1";
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function parseRequestBody_(e) {
  const raw = e?.postData?.contents || "";
  let body = {};

  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch (jsonError) {
      body = {};
    }
  }

  if (e?.parameter) {
    body = Object.assign({}, e.parameter, body);
  }

  if (body.payload && typeof body.payload === "string") {
    try {
      const parsedPayload = JSON.parse(body.payload);
      body = Object.assign({}, parsedPayload, body);
      delete body.payload;
    } catch (payloadError) {
      throw new Error("Payload invalido");
    }
  }

  return body;
}
