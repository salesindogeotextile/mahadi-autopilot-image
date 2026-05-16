/**
 * =========================================================
 * PRIMATEX AUTOPILOT API
 * =========================================================
 *
 * MODULE:
 * - post
 * - pillar
 * - image
 *
 * METHOD:
 * GET  -> ambil queue
 * POST -> update data / image action
 *
 * =========================================================
 */

function doGet(e) {
  const module = (e.parameter.module || "").toLowerCase();

  switch (module) {

    case "post":
      return getPostQueue(e);

    case "pillar":
      return getPillarQueue(e);

    case "image":
      return response({
        success: true,
        message: "PrimaTex Image API Active"
      });

    default:
      return response({
        success: false,
        error: "Invalid module"
      });
  }
}

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const module = (params.module || "").toLowerCase();

    switch (module) {

      case "post":
        return updatePost(params);

      case "pillar":
        return updatePillar(params);

      case "image":
        return imageHandler(params);

      default:
        return response({
          success: false,
          error: "Invalid module"
        });
    }

  } catch (err) {
    return response({
      success: false,
      error: err.toString()
    });
  }
}

/**
 * =========================================================
 * POST MODULE
 * =========================================================
 */

function getPostQueue(e) {
  const sheetName = e.parameter.sheetName || "Post";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return response({
      success: false,
      error: "Sheet not found"
    });
  }

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const status = data[i][18];
    if (status === "Queue") {
      return response({
        success: true,
        module: "post",
        row: i + 1,
        frasa_kunci: data[i][1],
        kategori: data[i][2],
        anchor_text1: data[i][3],
        url1: data[i][4],
        anchor_text2: data[i][5],
        url2: data[i][6],
        tag: data[i][13],
        wp_url: data[i][19],
        wp_username: data[i][20],
        wp_app_password: data[i][21],
        sheetName: sheetName
      });
    }
  }

  return response({
    success: false,
    message: "No queue found"
  });
}

function updatePost(params) {
  const sheetName = params.sheetName || "Post";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return response({
      success: false,
      error: "Sheet not found"
    });
  }

  const row = params.row;
  if (!row) {
    return response({
      success: false,
      error: "Row is required"
    });
  }

  updateCommonFields(sheet, row, params);

  return response({
    success: true,
    row: row
  });
}

/**
 * =========================================================
 * PILLAR MODULE
 * =========================================================
 */

function getPillarQueue(e) {
  const sheetName = e.parameter.sheetName || "Pillar";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return response({
      success: false,
      error: "Sheet not found"
    });
  }

  const data = sheet.getDataRange().getValues();
  let targetRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][18] === "Queue Pillar") {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    return response({
      success: false,
      message: "No queue found"
    });
  }

  const rowData = data[targetRow - 1];

  return response({
    success: true,
    module: "pillar",
    row: targetRow,
    frasa_kunci: rowData[1],
    kategori: rowData[2],
    anchor_text1: rowData[3],
    url1: rowData[4],
    text1: data[targetRow]?.[1] || "",
    text2: data[targetRow + 1]?.[1] || "",
    text3: data[targetRow + 2]?.[1] || "",
    text4: data[targetRow + 3]?.[1] || "",
    text5: data[targetRow + 4]?.[1] || "",
    text6: data[targetRow + 5]?.[1] || "",
    text7: data[targetRow + 6]?.[1] || "",
    text8: data[targetRow + 7]?.[1] || "",
    text9: data[targetRow + 8]?.[1] || "",
    text10: data[targetRow + 9]?.[1] || "",
    tag: rowData[13],
    url_judul: rowData[16],
    wp_url: rowData[19],
    wp_username: rowData[20],
    wp_app_password: rowData[21]
  });
}

function updatePillar(params) {
  const sheetName = params.sheetName || "Pillar";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return response({
      success: false,
      error: "Sheet not found"
    });
  }

  const row = params.row;
  if (!row) {
    return response({
      success: false,
      error: "Row is required"
    });
  }

  updateCommonFields(sheet, row, params);

  return response({
    success: true,
    row: row
  });
}

/**
 * =========================================================
 * IMAGE MODULE
 * =========================================================
 */

function imageHandler(params) {
  const action = params.action;
  const sheetName = params.sheetName || "Post";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return response({
      success: false,
      error: "Sheet " + sheetName + " not found"
    });
  }

  /**
   * GET NEXT IMAGE QUEUE
   */
  if (action === "getNext") {
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      const status = data[i][18];
      // Lebih fleksibel dalam mendeteksi status "Published"
      // Hapus spasi dan ubah ke huruf kecil
      const s = status ? status.toString().toLowerCase().trim() : "";
      
      // Cek apakah mengandung kata kunci utama
      const isPublished = s.indexOf("published") !== -1;
      const isQueue = s.indexOf("queue") !== -1 || s === "ready";

      if (isPublished || isQueue) {
        const rowId = i + 1;
        
        // Ambil data dengan fallback yang lebih aman
        const rawProjectName = data[i][22] ? data[i][22].toString().trim() : "";
        const rawKeyword = data[i][1] ? data[i][1].toString().trim() : "";
        
        // Prioritas: Project Name (Col W) -> Keyword (Col B)
        const projectName = rawProjectName || rawKeyword;
        
        // Jika benar-benar kosong, baru lewati
        if (!projectName) {
          console.log("Row " + rowId + " skipped: Project Name & Keyword empty");
          continue;
        }

        const rawHeadline = data[i][23] ? data[i][23].toString().trim() : "";
        const mainHeadline = rawHeadline || projectName;

        // Tandai sedang diproses agar tidak diambil instance lain
        sheet.getRange(rowId, 19).setValue("Processing Image");
        SpreadsheetApp.flush();

        return response({
          success: true,
          rowId: rowId,
          sheetUsed: sheetName,
          totalRowsChecked: i,
          projectName: projectName,
          mainHeadline: mainHeadline,
          wpUrl: data[i][19] || "",
          wpUsername: data[i][20] || "",
          wpPassword: data[i][21] || "",
          baseTone: data[i][24] || "White",
          aspectRatio: data[i][25] || "16:9"
        });
      }
    }

    return response({
      success: false,
      message: "Queue Empty in Sheet: " + sheetName,
      sheetUsed: sheetName
    });
  }

  /**
   * UPDATE STATUS IMAGE
   */
  if (action === "updateStatus") {
    if (!params.rowId || !params.status) {
      return response({
        success: false,
        error: "rowId and status required"
      });
    }

    sheet.getRange(params.rowId, 19).setValue(params.status);
    SpreadsheetApp.flush();

    return response({
      success: true
    });
  }

  return response({
    success: false,
    error: "Invalid action"
  });
}

/**
 * =========================================================
 * COMMON UPDATE FIELDS
 * =========================================================
 */

function updateCommonFields(sheet, row, params) {
  if (params.konten)
    sheet.getRange(row, 8).setValue(params.konten);
  if (params.judul)
    sheet.getRange(row, 9).setValue(params.judul);
  if (params.judul_seo)
    sheet.getRange(row, 10).setValue(params.judul_seo);
  if (params.slug)
    sheet.getRange(row, 11).setValue(params.slug);
  if (params.meta_deskripsi)
    sheet.getRange(row, 12).setValue(params.meta_deskripsi);
  if (params.kutipan)
    sheet.getRange(row, 13).setValue(params.kutipan);
  if (params.tag)
    sheet.getRange(row, 14).setValue(params.tag);
  if (params.published_url)
    sheet.getRange(row, 17).setValue(params.published_url);
  if (params.generate_status)
    sheet.getRange(row, 19).setValue(params.generate_status);
}

/**
 * =========================================================
 * JSON RESPONSE
 * =========================================================
 */

function response(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
