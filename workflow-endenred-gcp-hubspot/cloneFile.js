const { google } = require("googleapis");

exports.main = async (event, callback) => {
  const clientEmail = process.env.GCP_CLIENT_EMAIL;

  const part_1 = process.env.GCP_PRIVATE_KEY_PART_1;
  const part_2 = process.env.GCP_PRIVATE_KEY_PART_2;
  const privateKeyJoined = part_1 + part_2;
  const privateKey = privateKeyJoined.replace(/\\n/g, "\n");

  const project_id = process.env.GPC_PROJECT_ID;

  const private_key_id = process.env.GPC_PRIVATE_KEY_ID;

  const client_cert_url = process.env.GPC_CLIENT_CERT_URL;

  const sharedFolderId = process.env.GPC_SHARED_FOLDER_ID;

  const serviceAccount = {
    type: "service_account",
    project_id: project_id,
    private_key_id: private_key_id,
    private_key: privateKey,
    client_email: clientEmail,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: client_cert_url,
  };

  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  const drive = google.drive({ version: "v3", auth });

  try {
    const listFiles = await getFilesFromDrive(drive);

    if (!listFiles) {
      console.error("No se encontraron archivos");
      return;
    }

    const backupFile = listFiles.find(
      (file) => file.name === "Leads Invalidos"
    );

    if (!backupFile) {
      console.error(
        "No se encontró el archivo con el nombre 'Leads Invalidos'"
      );
      return;
    }

    const newFileId = await cloneFile(drive, backupFile.id, sharedFolderId);

    console.log("Archivo clonado:", newFileId.name);

    if (!newFileId) {
      console.error("No se pudo clonar el archivo");
      return;
    }

    // Limpiar el archivo original

    const spreadsheetId = process.env.SPREADSHEET_ID;

    await auth.authorize();
    const sheets = google.sheets({ version: "v4", auth });

    const spreadSheet = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    });

    const sheetNames = spreadSheet.data.sheets.map(
      (sheet) => sheet.properties.title
    );

    if (sheetNames.length > 1) {
      const request = sheetNames.slice(1).map((sheetName) => ({
        deleteSheet: {
          sheetId: spreadSheet.data.sheets.find(
            (sheet) => sheet.properties.title === sheetName
          ).properties.sheetId,
        },
      }));

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId,
        requestBody: {
          requests: request,
        },
      });
    }

    await sheets.spreadsheets.values.clear({
      spreadsheetId: spreadsheetId,
      range: sheetNames[0],
    });

    console.log("Archivo limpiado");
    callback({
      outputFields: {
        clonedFile: newFileId,
      },
    });
  } catch (error) {
    console.error("Error:", error);
    callback({
      outputFields: {
        Error: error,
      },
    });
  }
};

async function getFilesFromDrive(driveInstance) {
  try {
    const response = await driveInstance.files.list({
      pageSize: 10,
      fields: "files(id, name)",
    });

    const files = response.data.files;

    return files;
  } catch (error) {
    console.error("Error al obtener los archivos:", error);
  }
}

async function cloneFile(driveInstance, fileId, sharedFolderId) {
  try {
    const copyResponse = await driveInstance.files.copy({
      fileId: fileId,
      requestBody: {
        name: `Backup - ${new Date().toISOString()}`,
        parents: [sharedFolderId],
      },
    });

    return copyResponse.data;
  } catch (error) {
    console.error("Error al clonar el archivo:", error);
  }
}
