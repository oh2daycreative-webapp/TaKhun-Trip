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
