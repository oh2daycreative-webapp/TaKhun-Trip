function readSheetObjects_(sheetName) {
  var config = getAppConfig_();
  if (!config.spreadsheetId) throw new Error("Data source is not configured.");

  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("Requested data is not available.");

  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  var headers = values[0].map(function (header) {
    return header === null || header === undefined ? "" : String(header).trim();
  });

  return values.slice(1).filter(function (row) {
    return row.some(function (cell) { return cell !== null && cell !== undefined && String(cell).trim() !== ""; });
  }).map(function (row) {
    var item = {};
    headers.forEach(function (header, index) {
      if (header) item[header] = index < row.length ? row[index] : "";
    });
    return item;
  });
}

function appendSheetObject_(sheetName, requiredHeaders, record) {
  var config = getAppConfig_();
  if (!config.spreadsheetId) throw new Error("Data source is not configured.");
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("Requested data is not available.");
  var values = sheet.getDataRange().getValues();
  if (!values || !values.length) throw new Error("Data headers are not available.");
  var headers = values[0].map(function (header) {
    return header === null || header === undefined ? "" : String(header).trim();
  });
  (requiredHeaders || []).forEach(function (header) {
    if (headers.indexOf(header) === -1) throw new Error("Required data headers are not available.");
  });
  var row = headers.map(function (header) {
    return header && Object.prototype.hasOwnProperty.call(record || {}, header) ? record[header] : "";
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
}

function SheetService_readTable_(sheetName, requiredHeaders) {
  var sheet = SheetService_getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (!values || !values.length || sheet.getLastRow() < 1) {
    throw new Error("Data headers are not available.");
  }

  var headers = SheetService_normalizeHeaders_(values[0]);
  var headerMap = SheetService_assertUniqueHeaders_(headers, requiredHeaders);
  var rows = [];

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    var row = values[rowIndex] || [];
    var populated = row.some(function (cell) {
      return cell !== null && cell !== undefined && String(cell).trim() !== "";
    });
    if (!populated) continue;

    var projected = Object.create(null);
    headers.forEach(function (header, columnIndex) {
      projected[header] = columnIndex < row.length ? row[columnIndex] : "";
    });
    rows.push({ sourceRowNumber: rowIndex + 1, values: projected });
  }

  return { headers: headers.slice(), headerMap: headerMap, rows: rows };
}

function SheetService_assertUniqueHeaders_(headers, requiredHeaders) {
  if (!Array.isArray(headers) || !Array.isArray(requiredHeaders || [])) {
    throw new Error("Data headers are invalid.");
  }

  var headerMap = Object.create(null);
  var caseFoldedHeaders = Object.create(null);
  headers.forEach(function (header, index) {
    if (typeof header !== "string" || !header.trim()) {
      throw new Error("Data headers are invalid.");
    }
    var normalized = header.trim();
    if (Object.prototype.hasOwnProperty.call(headerMap, normalized)) {
      throw new Error("Data headers must be unique.");
    }
    var caseFolded = normalized.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(caseFoldedHeaders, caseFolded)) {
      throw new Error("Data headers conflict.");
    }
    caseFoldedHeaders[caseFolded] = true;
    headerMap[normalized] = index;
  });

  var requiredMap = Object.create(null);
  (requiredHeaders || []).forEach(function (header) {
    if (typeof header !== "string" || !header || header !== header.trim()) {
      throw new Error("Required data headers are invalid.");
    }
    if (Object.prototype.hasOwnProperty.call(requiredMap, header)) {
      throw new Error("Required data headers must be unique.");
    }
    requiredMap[header] = true;
    if (!Object.prototype.hasOwnProperty.call(headerMap, header)) {
      throw new Error("Required data headers are not available.");
    }
  });

  return headerMap;
}

function SheetService_updateObjectAtRow_(sheetName, sourceRowNumber, record) {
  if (!Number.isSafeInteger(sourceRowNumber) || sourceRowNumber < 2) {
    throw new Error("Data row number is invalid.");
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Data update is invalid.");
  }

  var fields = Object.keys(record);
  if (!fields.length) throw new Error("Data update is empty.");

  var sheet = SheetService_getSheet_(sheetName);
  if (sourceRowNumber > sheet.getLastRow()) throw new Error("Data row is not available.");
  var values = sheet.getDataRange().getValues();
  if (!values || !values.length) throw new Error("Data headers are not available.");
  var headers = SheetService_normalizeHeaders_(values[0]);
  var headerMap = SheetService_assertUniqueHeaders_(headers, fields);

  fields.forEach(function (field) {
    sheet.getRange(sourceRowNumber, headerMap[field] + 1).setValue(record[field]);
  });
}

function SheetService_appendObjectWithRow_(sheetName, requiredHeaders, record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Data append is invalid.");
  }

  var fields = Object.keys(record);
  var sheet = SheetService_getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (!values || !values.length || sheet.getLastRow() < 1) {
    throw new Error("Data headers are not available.");
  }
  var headers = SheetService_normalizeHeaders_(values[0]);
  SheetService_assertUniqueHeaders_(headers, SheetService_validateRequiredHeaders_(requiredHeaders));
  SheetService_assertUniqueHeaders_(headers, fields);

  var row = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : "";
  });
  var sourceRowNumber = sheet.getLastRow() + 1;
  sheet.getRange(sourceRowNumber, 1, 1, headers.length).setValues([row]);
  return SheetService_rowResult_(headers, sourceRowNumber, row);
}

function SheetService_replaceObjectAtRow_(sheetName, sourceRowNumber, record) {
  if (!Number.isSafeInteger(sourceRowNumber) || sourceRowNumber < 2) {
    throw new Error("Data row number is invalid.");
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Data replacement is invalid.");
  }

  var fields = Object.keys(record);
  if (!fields.length) throw new Error("Data replacement is empty.");
  var sheet = SheetService_getSheet_(sheetName);
  if (sourceRowNumber > sheet.getLastRow()) throw new Error("Data row is not available.");
  var values = sheet.getDataRange().getValues();
  if (!values || !values.length) throw new Error("Data headers are not available.");
  var headers = SheetService_normalizeHeaders_(values[0]);
  var headerMap = SheetService_assertUniqueHeaders_(headers, fields);
  var row = sheet.getRange(sourceRowNumber, 1, 1, headers.length).getValues()[0];
  while (row.length < headers.length) row.push("");
  fields.forEach(function (field) { row[headerMap[field]] = record[field]; });
  sheet.getRange(sourceRowNumber, 1, 1, headers.length).setValues([row]);
  return SheetService_rowResult_(headers, sourceRowNumber, row);
}

function SheetService_clearRow_(sheetName, sourceRowNumber) {
  if (!Number.isSafeInteger(sourceRowNumber) || sourceRowNumber < 2) {
    throw new Error("Data row number is invalid.");
  }
  var sheet = SheetService_getSheet_(sheetName);
  if (sourceRowNumber > sheet.getLastRow()) throw new Error("Data row is not available.");
  var values = sheet.getDataRange().getValues();
  if (!values || !values.length) throw new Error("Data headers are not available.");
  var headers = SheetService_normalizeHeaders_(values[0]);
  SheetService_assertUniqueHeaders_(headers, []);
  sheet.getRange(sourceRowNumber, 1, 1, headers.length).clearContent();
}

function SheetService_ensureHeaders_(sheetName, requiredHeaders) {
  var sheet = SheetService_getSheet_(sheetName);
  var required = SheetService_validateRequiredHeaders_(requiredHeaders);
  var values = sheet.getDataRange().getValues();
  var headers = [];

  if (sheet.getLastRow() > 0) {
    if (!values || !values.length) throw new Error("Data headers are not available.");
    headers = SheetService_normalizeHeaders_(values[0]);
    SheetService_assertUniqueHeaders_(headers, []);
  }

  var existingMap = Object.create(null);
  headers.forEach(function (header, index) { existingMap[header] = index; });
  required.forEach(function (requiredHeader) {
    headers.forEach(function (existingHeader) {
      if (existingHeader !== requiredHeader && existingHeader.toLowerCase() === requiredHeader.toLowerCase()) {
        throw new Error("Data headers conflict with required headers.");
      }
    });
  });
  var appendedHeaders = required.filter(function (header) {
    return !Object.prototype.hasOwnProperty.call(existingMap, header);
  });

  if (appendedHeaders.length) {
    sheet.getRange(1, headers.length + 1, 1, appendedHeaders.length).setValues([appendedHeaders]);
    headers = headers.concat(appendedHeaders);
  }

  return {
    headers: headers.slice(),
    headerMap: SheetService_assertUniqueHeaders_(headers, required),
    appendedHeaders: appendedHeaders.slice()
  };
}

function SheetService_escapeHumanText_(value) {
  if (typeof value !== "string") throw new Error("Human text value is invalid.");
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function SheetService_writeValue_(policy, fieldName, value) {
  if (policy === "human_text") {
    if (fieldName !== "display_name" && fieldName !== "email") {
      throw new Error("Human text field is invalid.");
    }
    return SheetService_escapeHumanText_(value);
  }
  if (policy !== "security") throw new Error("Sheet write policy is invalid.");
  if (typeof fieldName !== "string") throw new Error("Security field is invalid.");

  if (fieldName === "token_hash" || fieldName === "password_hash") {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value)) {
      throw new Error("Security hash value is invalid.");
    }
    return value;
  }

  if (fieldName === "password_salt") {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{21}[AQgw]$/.test(value)) {
      throw new Error("Security salt value is invalid.");
    }
    return value;
  }

  if (fieldName === "admin_id" || fieldName === "session_id") {
    var prefix = fieldName === "admin_id" ? "ADM-" : "SES-";
    var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (typeof value !== "string" || value.slice(0, 4) !== prefix || !uuidPattern.test(value.slice(4))) {
      throw new Error("Security identifier value is invalid.");
    }
    return value;
  }

  if (fieldName === "password_algorithm") {
    if (value !== "pbkdf2_sha256") throw new Error("Security algorithm value is invalid.");
    return value;
  }

  if (fieldName === "username") {
    if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(value)) {
      throw new Error("Security username value is invalid.");
    }
    return value;
  }

  if (fieldName === "role") {
    if (["super_admin", "editor", "reviewer", "viewer"].indexOf(value) === -1) {
      throw new Error("Security role value is invalid.");
    }
    return value;
  }

  if (fieldName === "status") {
    if (["active", "inactive", "deleted"].indexOf(value) === -1) {
      throw new Error("Security status value is invalid.");
    }
    return value;
  }

  if (fieldName === "password_iterations") {
    if (!Number.isSafeInteger(value) || value < 100000 || value > 1000000) {
      throw new Error("Security iteration value is invalid.");
    }
    return value;
  }

  if (SheetService_isAuthTimestampField_(fieldName)) {
    if ((fieldName === "last_login_at" || fieldName === "revoked_at") && value === "") return value;
    if (!SheetService_isCanonicalAuthTimestamp_(value)) {
      throw new Error("Security timestamp value is invalid.");
    }
    return value;
  }

  throw new Error("Security field is invalid.");
}

function SheetService_getSheet_(sheetName) {
  var config = getAppConfig_();
  if (!config.spreadsheetId) throw new Error("Data source is not configured.");
  var sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName(sheetName);
  if (!sheet) throw new Error("Requested data is not available.");
  return sheet;
}

function SheetService_normalizeHeaders_(headers) {
  return (headers || []).map(function (header) {
    return typeof header === "string" ? header.trim() : header;
  });
}

function SheetService_validateRequiredHeaders_(requiredHeaders) {
  if (!Array.isArray(requiredHeaders) || !requiredHeaders.length) {
    throw new Error("Required data headers are invalid.");
  }
  var seen = Object.create(null);
  return requiredHeaders.map(function (header) {
    if (typeof header !== "string" || !header || header !== header.trim()) {
      throw new Error("Required data headers are invalid.");
    }
    if (Object.prototype.hasOwnProperty.call(seen, header)) {
      throw new Error("Required data headers must be unique.");
    }
    seen[header] = true;
    return header;
  });
}

function SheetService_rowResult_(headers, sourceRowNumber, row) {
  var projected = Object.create(null);
  headers.forEach(function (header, index) { projected[header] = row[index]; });
  return { sourceRowNumber: sourceRowNumber, values: projected };
}

function SheetService_isAuthTimestampField_(fieldName) {
  return ["last_login_at", "created_at", "updated_at", "expires_at", "revoked_at", "last_seen_at"].indexOf(fieldName) !== -1;
}

function SheetService_isCanonicalAuthTimestamp_(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  var parsed = new Date(value);
  return !isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
